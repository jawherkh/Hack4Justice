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

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  durationMs: number;
}

export class SandboxRunError extends Error {
  readonly code = "sandbox_run_failed";
}

const workdir = "/work";

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
  return [
    "run",
    "--rm",
    "--name", containerName,
    "--network", "none",
    "--user", "65534:65534",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--read-only",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
    "--pids-limit", String(limits.pids),
    // The workspace is a host directory, so the file size limit is what stops a run from
    // filling the host disk. The open file limit bounds descriptor use.
    "--ulimit", `fsize=${limits.fileBytes}:${limits.fileBytes}`,
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
      let stdout = "";
      let stderr = "";
      let truncated = false;
      let timedOut = false;
      let finished = false;

      const collect = (stream: NodeJS.ReadableStream, append: (chunk: string) => void) => {
        stream.on("data", (chunk: Buffer) => {
          const room = this.limits.outputBytes - (stdout.length + stderr.length);
          if (room <= 0) {
            truncated = true;
            return;
          }
          const text = chunk.toString("utf8");
          if (text.length > room) {
            truncated = true;
            append(text.slice(0, room));
          } else {
            append(text);
          }
        });
      };
      collect(child.stdout, (text) => { stdout += text; });
      collect(child.stderr, (text) => { stderr += text; });

      const timer = setTimeout(() => {
        timedOut = true;
        // Removing the container by name stops the workload even when the client is wedged.
        spawn(this.dockerBinary, ["rm", "--force", name], { stdio: "ignore" });
        child.kill("SIGKILL");
      }, this.limits.timeoutMs);

      const done = (exitCode: number | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        settle({ exitCode, stdout, stderr, truncated, timedOut, durationMs: Date.now() - startedAt });
      };

      child.on("error", (error) => {
        stderr += `\n${error.message}`;
        done(null);
      });
      child.on("close", (code) => done(code));
    });
  }

  /** Stops a run that is still going. Safe to call when the container is already gone. */
  async terminate(workspace: Workspace): Promise<void> {
    const name = this.containerName(workspace);
    await new Promise<void>((settle) => {
      const child = spawn(this.dockerBinary, ["rm", "--force", name], { stdio: "ignore" });
      child.on("error", () => settle());
      child.on("close", () => settle());
    });
  }
}
