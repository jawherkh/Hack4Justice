import { spawn } from "node:child_process";

import type { Workspace } from "./workspace";

export interface RunLimits {
  cpus: number;
  memoryMb: number;
  /** Wall-clock limit. A run that passes it is killed, so a runaway process cannot hold the host. */
  timeoutMs: number;
  /** Process limit, which stops a fork bomb from exhausting the host's process table. */
  pids: number;
  /** Largest amount of stdout or stderr kept. Output past it is dropped and flagged. */
  outputBytes: number;
  /**
   * Largest file the container may create. The workspace is a host directory, so without
   * this a run could fill the host disk however small its memory limit is.
   */
  fileBytes: number;
  /** Open file limit, so a run cannot exhaust the host's descriptors. */
  openFiles: number;
}

export const defaultRunLimits: RunLimits = {
  cpus: 1,
  memoryMb: 512,
  timeoutMs: 30_000,
  pids: 128,
  outputBytes: 256 * 1024,
  fileBytes: 32 * 1024 * 1024,
  openFiles: 256,
};

const hostUid = typeof process.getuid === "function" ? process.getuid() : undefined;
const hostGid = typeof process.getgid === "function" ? process.getgid() : undefined;
/** Use the API UID when it is non-root so it can access the private bind mount. */
export const defaultContainerUser = hostUid !== undefined && hostUid > 0
  ? `${hostUid}:${hostGid ?? hostUid}`
  : "65534:65534";

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  /** Set when the run was stopped for filling its workspace past the allowed total. */
  limitExceeded: boolean;
  durationMs: number;
}

/**
 * How often the workspace is measured while a run is going.
 *
 * The per-file limit does not bound the total, because a run can write many files, so the
 * total is watched instead. This stops a run from filling the disk, but it is not a precise
 * quota: a run writing at full disk speed can pass the limit by whatever it manages between
 * two measurements, which is tens of megabytes on a fast disk. Treat the limit as a
 * backstop. A workspace on a filesystem created with a fixed size is the way to make the
 * bound exact, and is worth doing if untrusted runs ever share a disk with anything that
 * matters.
 */
const usagePollMs = 100;

export class SandboxRunError extends Error {
  readonly code = "sandbox_run_failed";
}

const workdir = "/work";

export interface CapturedOutput {
  stdout: string;
  stderr: string;
  bytes: number;
  truncated: boolean;
}

export function appendOutputChunk(
  output: CapturedOutput,
  stream: "stdout" | "stderr",
  chunk: Uint8Array,
  limitBytes: number,
): void {
  const room = limitBytes - output.bytes;
  if (room <= 0) {
    output.truncated = true;
    return;
  }

  const text = Buffer.from(chunk).toString("utf8");
  if (Buffer.byteLength(text, "utf8") <= room) {
    output[stream] += text;
    output.bytes += Buffer.byteLength(text, "utf8");
    return;
  }

  // Trim by characters after decoding so the returned string remains valid UTF-8 while
  // keeping its encoded size within the byte limit.
  let prefix = text;
  while (prefix.length > 0 && Buffer.byteLength(prefix, "utf8") > room) {
    prefix = prefix.slice(0, -1);
  }
  output[stream] += prefix;
  output.bytes += Buffer.byteLength(prefix, "utf8");
  output.truncated = true;
}

/**
 * Builds the container arguments for one run.
 *
 * Exported so the restrictions can be asserted directly. Every flag here is a restriction:
 * no network, no root, no capabilities, no privilege escalation, a read-only image
 * filesystem, and a single writable mount holding this run's workspace. The host's Docker
 * socket and any unrelated host path are never mounted, so a process inside the container
 * cannot reach another dossier, the host filesystem, or the Docker daemon.
 */
export function buildRunArguments(
  workspace: Workspace,
  command: readonly string[],
  image: string,
  limits: RunLimits,
  containerName: string,
): string[] {
  if (command.length === 0) throw new SandboxRunError("a command is required");
  const fileBytes = Math.min(limits.fileBytes, workspace.limits.fileBytes);
  return [
    "run",
    "--rm",
    "--name", containerName,
    "--network", "none",
    "--user", defaultContainerUser,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
    "--pids-limit", String(limits.pids),
    // The workspace is a host directory, so the file size limit is what stops a run from
    // filling the host disk. The open file limit bounds descriptor use.
    "--ulimit", `fsize=${fileBytes}:${fileBytes}`,
    "--ulimit", `nofile=${limits.openFiles}:${limits.openFiles}`,
    "--memory", `${limits.memoryMb}m`,
    // Matching swap to memory stops the limit being sidestepped by swapping.
    "--memory-swap", `${limits.memoryMb}m`,
    "--cpus", String(limits.cpus),
    "--workdir", workdir,
    "--volume", `${workspace.root}:${workdir}:rw`,
    image,
    ...command,
  ];
}

/** Runs commands inside a container that can reach this run's workspace and nothing else. */
export class DockerRunner {
  constructor(
    private readonly image: string,
    private readonly limits: RunLimits = defaultRunLimits,
    private readonly dockerBinary = "docker",
  ) {}

  containerName(workspace: Workspace) {
    return `h4j-${workspace.dossierId}-${workspace.runId}`;
  }

  async run(workspace: Workspace, command: readonly string[]): Promise<RunResult> {
    const name = this.containerName(workspace);
    const args = buildRunArguments(workspace, command, this.image, this.limits, name);
    const startedAt = Date.now();

    return await new Promise<RunResult>((settle) => {
      const child = spawn(this.dockerBinary, args, { stdio: ["ignore", "pipe", "pipe"] });
      const output: CapturedOutput = { stdout: "", stderr: "", bytes: 0, truncated: false };
      let timedOut = false;
      let limitExceeded = false;
      let finished = false;

      const collect = (stream: NodeJS.ReadableStream, channel: "stdout" | "stderr") => {
        stream.on("data", (chunk: Buffer) => {
          appendOutputChunk(output, channel, chunk, this.limits.outputBytes);
        });
      };
      collect(child.stdout, "stdout");
      collect(child.stderr, "stderr");

      const run = (args: string[]) => new Promise<number | null>((settle) => {
        const child = spawn(this.dockerBinary, args, { stdio: "ignore" });
        child.on("error", () => settle(null));
        child.on("close", (code) => settle(code));
      });

      /**
       * Removes the container and confirms it is gone.
       *
       * A single remove can miss: the request can land while the container is still being
       * created, and the container then keeps running after the client is killed. So the
       * remove is repeated until the runtime reports no such container, within a bound.
       */
      const stop = async () => {
        child.kill("SIGKILL");
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          if (await run(["rm", "--force", name]) === 0) return;
          const remaining = await new Promise<string>((settle) => {
            const check = spawn(this.dockerBinary, ["ps", "--all", "--quiet", "--filter", `name=^${name}$`], { stdio: ["ignore", "pipe", "ignore"] });
            let text = "";
            check.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); });
            check.on("error", () => settle(""));
            check.on("close", () => settle(text.trim()));
          });
          if (remaining === "") return;
          await new Promise((settle) => setTimeout(settle, 300));
        }
      };

      let stopping: Promise<void> | undefined;

      // A run can write many files, so the workspace total is watched while it executes.
      const watcher = setInterval(() => {
        void workspace.usage().then((used) => {
          if (used > workspace.limits.totalBytes && !finished) {
            limitExceeded = true;
            stopping = stop();
          }
        }).catch(() => {});
      }, usagePollMs);

      const timer = setTimeout(() => {
        timedOut = true;
        // Removing the container by name stops the workload even when the client is wedged.
        stopping = stop();
      }, this.limits.timeoutMs);

      const done = (exitCode: number | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearInterval(watcher);
        // A stopped run reports back only once its container is gone, so a caller is never
        // told the work ended while it is still running on the host.
        void Promise.resolve(stopping).then(() => {
          settle({ exitCode, stdout: output.stdout, stderr: output.stderr, truncated: output.truncated,
            timedOut, limitExceeded, durationMs: Date.now() - startedAt });
        });
      };

      child.on("error", (error) => {
        appendOutputChunk(output, "stderr", Buffer.from(`\n${error.message}`), this.limits.outputBytes);
        done(null);
      });
      child.on("close", (code) => done(code));
    });
  }

  /**
   * Stops a run that is still going. Safe to call when the container is already gone.
   *
   * Uses the same repeated removal as a timed-out run: one request can land while the
   * container is still being created and miss it, leaving the run going after the caller
   * believes it stopped.
   */
  async terminate(workspace: Workspace): Promise<void> {
    const name = this.containerName(workspace);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const removed = await new Promise<number | null>((settle) => {
        const child = spawn(this.dockerBinary, ["rm", "--force", name], { stdio: "ignore" });
        child.on("error", () => settle(null));
        child.on("close", (code) => settle(code));
      });
      if (removed === 0) return;
      const remaining = await new Promise<string>((settle) => {
        const check = spawn(this.dockerBinary, ["ps", "--all", "--quiet", "--filter", `name=^${name}$`], { stdio: ["ignore", "pipe", "ignore"] });
        let text = "";
        check.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); });
        check.on("error", () => settle(""));
        check.on("close", () => settle(text.trim()));
      });
      if (remaining === "") return;
      await new Promise((settle) => setTimeout(settle, 300));
    }
  }
}
