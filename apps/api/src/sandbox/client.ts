import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  SandboxClient,
  SandboxClientCreateArgs,
  SandboxClientOptions,
  SandboxClientResumeOptions,
  SandboxExecResult,
  SandboxSession,
  SandboxSessionState,
  SandboxDirectoryEntry,
  ExecCommandArgs,
  ListDirectoryArgs,
  ReadFileArgs,
} from "@openai/agents/sandbox";
import type { ApplyPatchOperation, Editor } from "@openai/agents";
import { Manifest } from "@openai/agents/sandbox";
import { applyDiff } from "@openai/agents";

import { SandboxLimitError, SandboxPathError, Workspace } from "./workspace";
import { DockerRunner, defaultRunLimits, type RunLimits } from "./runner";

const workspacePath = "/work";

export interface ProjectDockerSandboxOptions extends SandboxClientOptions {
  /** Host directory containing private dossier/run workspaces. */
  workspaceBaseDir?: string;
  /** Image passed to the project DockerRunner. */
  image?: string;
  /** Per-run resource limits enforced by the project runner. */
  runLimits?: RunLimits;
  /** Supplied by the agent service; never accepted from model input. */
  dossierId?: string;
  /** Stable agent-session workspace identifier, supplied by the agent service. */
  runId?: string;
}

export interface ProjectDockerSandboxSessionState extends SandboxSessionState {
  dossierId: string;
  runId: string;
  workspaceRootPath: string;
  image: string;
}

function isManifest(value: unknown): value is Manifest {
  return value instanceof Manifest;
}

function relativeWorkspacePath(path: string | undefined): string {
  if (!path || path === workspacePath || path === ".") return ".";
  if (path.startsWith(`${workspacePath}/`)) return path.slice(workspacePath.length + 1);
  if (path.startsWith("/")) throw new SandboxPathError("sandbox path must be under /work");
  return path;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandWithWorkdir(command: string, workdir?: string): string {
  const path = relativeWorkspacePath(workdir);
  return path === "." ? command : `cd ${shellQuote(join(workspacePath, path))} && ${command}`;
}

class ProjectDockerEditor implements Editor {
  constructor(private readonly workspace: Workspace) {}

  async createFile(operation: Extract<ApplyPatchOperation, { type: "create_file" }>) {
    await this.workspace.writeFile(operation.path, applyDiff("", operation.diff, "create"));
    return { status: "completed" as const, output: `created ${operation.path}` };
  }

  async updateFile(operation: Extract<ApplyPatchOperation, { type: "update_file" }>) {
    const current = new TextDecoder().decode(await this.workspace.readFile(operation.path));
    const next = applyDiff(current, operation.diff);
    if (operation.moveTo) {
      await this.workspace.writeFile(operation.moveTo, next);
      await this.workspace.deleteFile(operation.path);
    } else {
      await this.workspace.writeFile(operation.path, next);
    }
    return { status: "completed" as const, output: `updated ${operation.path}` };
  }

  async deleteFile(operation: Extract<ApplyPatchOperation, { type: "delete_file" }>) {
    await this.workspace.deleteFile(operation.path);
    return { status: "completed" as const, output: `deleted ${operation.path}` };
  }
}

export class ProjectDockerSandboxSession implements SandboxSession<ProjectDockerSandboxSessionState> {
  private closed = false;

  constructor(
    readonly state: ProjectDockerSandboxSessionState,
    private readonly workspace: Workspace,
    private readonly runner: DockerRunner,
  ) {}

  private assertOpen(): void {
    if (this.closed) throw new Error("sandbox session is closed");
  }

  private path(path: string | undefined): string {
    return relativeWorkspacePath(path);
  }

  async exec(args: ExecCommandArgs): Promise<SandboxExecResult> {
    this.assertOpen();
    const startedAt = Date.now();
    const result = await this.runner.run(this.workspace, [
      "sh",
      "-c",
      commandWithWorkdir(args.cmd, args.workdir),
    ]);
    const output = result.stderr
      ? `${result.stdout}${result.stdout ? "\n" : ""}${result.stderr}`
      : result.stdout;
    return {
      output,
      stdout: result.stdout,
      stderr: result.stderr,
      wallTimeSeconds: Math.max(result.durationMs, Date.now() - startedAt) / 1000,
      exitCode: result.exitCode,
    };
  }

  async execCommand(args: ExecCommandArgs): Promise<string> {
    return (await this.exec(args)).output;
  }

  async readFile(args: ReadFileArgs): Promise<Uint8Array> {
    this.assertOpen();
    const bytes = await this.workspace.readFile(this.path(args.path));
    if (args.maxBytes !== undefined && bytes.byteLength > args.maxBytes) {
      throw new SandboxLimitError("file exceeds the requested read limit");
    }
    return bytes;
  }

  async listDir(args: ListDirectoryArgs): Promise<SandboxDirectoryEntry[]> {
    this.assertOpen();
    return await this.workspace.listDirectory(this.path(args.path));
  }

  async pathExists(path: string): Promise<boolean> {
    try {
      await this.workspace.resolvePath(this.path(path));
      return true;
    } catch {
      return false;
    }
  }

  async directoryExists(path: string): Promise<boolean> {
    try {
      const entries = await this.workspace.listDirectory(this.path(path));
      void entries;
      return true;
    } catch {
      return false;
    }
  }

  createEditor(): Editor {
    this.assertOpen();
    return new ProjectDockerEditor(this.workspace);
  }

  supportsPty(): boolean {
    return false;
  }

  async applyManifest(manifest: Manifest): Promise<void> {
    this.assertOpen();
    for (const entry of manifest.iterEntries()) {
      if (entry.entry.type === "file") {
        await this.workspace.writeFile(entry.logicalPath, entry.entry.content);
      } else if (entry.entry.type === "dir") {
        await this.workspace.resolvePath(entry.logicalPath);
      }
    }
  }

  /** Host-side staging hook used only for trusted application data, never model input. */
  async writeWorkspaceFile(path: string, bytes: Uint8Array | string): Promise<void> {
    this.assertOpen();
    await this.workspace.writeFile(this.path(path), bytes);
  }

  async exportWorkspaceArtifact(path: string) {
    this.assertOpen();
    return await this.workspace.exportArtifact(this.path(path));
  }

  async close(): Promise<void> {
    this.closed = true;
    // The project runner removes each container after a command. The workspace intentionally
    // remains so a later agent turn can resume it and so published artifacts remain traceable.
  }
}

function createArgs(
  args: SandboxClientCreateArgs<ProjectDockerSandboxOptions> | Manifest | undefined,
  fallback: ProjectDockerSandboxOptions,
): { manifest: Manifest; options: ProjectDockerSandboxOptions } {
  if (isManifest(args)) return { manifest: args, options: fallback };
  const manifest = isManifest(args?.manifest) ? args.manifest : new Manifest(args?.manifest);
  return { manifest, options: { ...fallback, ...(args?.options ?? {}) } };
}

/**
 * Agents SDK SandboxClient backed by this project's hardened DockerRunner.
 *
 * The SDK supplies the model-facing shell/filesystem capabilities; all commands still pass
 * through Workspace path validation and DockerRunner's non-root, no-network container flags.
 */
export class ProjectDockerSandboxClient implements SandboxClient<
  ProjectDockerSandboxOptions,
  ProjectDockerSandboxSessionState
> {
  readonly backendId = "hack4justice_docker";
  readonly supportsDefaultOptions = true;

  constructor(private readonly options: ProjectDockerSandboxOptions = {}) {}

  async create(
    args?: SandboxClientCreateArgs<ProjectDockerSandboxOptions> | Manifest,
    manifestOptions?: ProjectDockerSandboxOptions,
  ): Promise<ProjectDockerSandboxSession> {
    const { manifest, options } = createArgs(args, { ...this.options, ...(manifestOptions ?? {}) });
    if (!options.dossierId || !options.runId)
      throw new Error("dossierId and runId are required for a project sandbox");
    const baseDir = options.workspaceBaseDir ?? ".local-data/agent-sandboxes";
    await mkdir(baseDir, { recursive: true, mode: 0o700 });
    const workspace = await Workspace.create(baseDir, options.dossierId, options.runId);
    const image = options.image ?? "alpine:3.20";
    const session = new ProjectDockerSandboxSession(
      {
        manifest,
        dossierId: options.dossierId,
        runId: options.runId,
        workspaceRootPath: workspace.root,
        image,
      },
      workspace,
      new DockerRunner(image, options.runLimits ?? defaultRunLimits),
    );
    await session.applyManifest(manifest);
    return session;
  }

  async resume(
    state: ProjectDockerSandboxSessionState,
    options?: SandboxClientResumeOptions<ProjectDockerSandboxOptions>,
  ): Promise<ProjectDockerSandboxSession> {
    const merged = { ...this.options, ...(options?.clientOptions ?? {}) };
    const baseDir = merged.workspaceBaseDir ?? ".local-data/agent-sandboxes";
    const workspace = await Workspace.create(baseDir, state.dossierId, state.runId);
    if (workspace.root !== state.workspaceRootPath) throw new SandboxPathError("sandbox workspace changed");
    const image = merged.image ?? state.image;
    return new ProjectDockerSandboxSession(
      state,
      workspace,
      new DockerRunner(image, merged.runLimits ?? defaultRunLimits),
    );
  }

  async serializeSessionState(state: ProjectDockerSandboxSessionState): Promise<Record<string, unknown>> {
    return { ...state, manifest: state.manifest };
  }

  async deserializeSessionState(state: Record<string, unknown>): Promise<ProjectDockerSandboxSessionState> {
    const manifest =
      state.manifest instanceof Manifest
        ? state.manifest
        : new Manifest(state.manifest as ConstructorParameters<typeof Manifest>[0]);
    return { ...state, manifest } as ProjectDockerSandboxSessionState;
  }

  validateSessionStateForResume(): void {
    // Workspace containment is rechecked by resume() before the session is usable.
  }

  async delete(state: ProjectDockerSandboxSessionState): Promise<void> {
    const session = await this.resume(state);
    await session.close();
  }
}

export type ProjectSandboxSession = ProjectDockerSandboxSession;
