import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

// Refusing to follow a link on open closes the gap between checking a path and using it:
// a container writing into the same directory could otherwise replace a checked file with
// a link at exactly that moment.
//
// Windows has no such flag and rejects numeric open flags outright, so it uses the plain
// modes and relies on the explicit link check below. Runs execute on Linux, where the flag
// applies.
const onWindows = process.platform === "win32";
const readFlags: string | number = onWindows ? "r" : constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const writeFlags: string | number = onWindows
  ? "w"
  : constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0);

export class SandboxPathError extends Error {
  readonly code = "invalid_path";
}

export class SandboxLimitError extends Error {
  readonly code = "limit_exceeded";
}

/** One identifier segment. Anything outside this set could alter a path or a container name. */
const segment = /^[a-z0-9][a-z0-9_-]{0,62}$/i;

function assertSegment(value: string, label: string) {
  if (!segment.test(value)) throw new SandboxPathError(`${label} must match ${segment}`);
}

function isInside(root: string, target: string) {
  return target === root || target.startsWith(root + sep);
}

export interface WorkspaceLimits {
  /** Largest single file the API will read or write inside the workspace. */
  fileBytes: number;
  /** Largest total size the workspace may reach. */
  totalBytes: number;
}

export const defaultWorkspaceLimits: WorkspaceLimits = {
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
};

export interface ArtifactProvenance {
  path: string;
  bytes: number;
  sha256: string;
  dossierId: string;
  runId: string;
  exportedAt: string;
}

/**
 * A writable directory for one run of one dossier.
 *
 * Every path a caller supplies is resolved against the workspace root and refused if it
 * lands outside, including by way of a symbolic link. Two dossiers never share a root, so
 * one cannot reach the other's files.
 */
export class Workspace {
  private constructor(
    readonly dossierId: string,
    readonly runId: string,
    readonly root: string,
    readonly limits: WorkspaceLimits,
  ) {}

  static async create(
    baseDir: string,
    dossierId: string,
    runId: string,
    limits: WorkspaceLimits = defaultWorkspaceLimits,
  ): Promise<Workspace> {
    assertSegment(dossierId, "dossierId");
    assertSegment(runId, "runId");
    const base = await realpath(baseDir);
    const root = join(base, dossierId, runId);
    await mkdir(root, { recursive: true });
    // The realpath is stored so a link anywhere in the base directory cannot widen the root.
    return new Workspace(dossierId, runId, await realpath(root), limits);
  }

  /**
   * Turns a caller-supplied relative path into an absolute one inside this workspace.
   *
   * The check follows links on the part of the path that exists, so a link planted inside
   * the workspace cannot be used to read or write a file outside it.
   */
  async resolvePath(relativePath: string): Promise<string> {
    if (typeof relativePath !== "string" || relativePath.length === 0) {
      throw new SandboxPathError("path is required");
    }
    if (isAbsolute(relativePath)) throw new SandboxPathError("path must be relative");
    if (relativePath.includes("\0")) throw new SandboxPathError("path must not contain a null byte");

    const target = resolve(this.root, relativePath);
    if (!isInside(this.root, target)) throw new SandboxPathError("path escapes the workspace");

    let existing = target;
    while (true) {
      try {
        const real = await realpath(existing);
        if (!isInside(this.root, real)) throw new SandboxPathError("path escapes the workspace");
        break;
      } catch (error) {
        if (error instanceof SandboxPathError) throw error;
        const parent = dirname(existing);
        // The root itself always exists, so this walk terminates.
        if (parent === existing) break;
        existing = parent;
      }
    }
    return target;
  }

  /** Refuses a path whose final component is a link, before it is opened. */
  private async assertNotLink(target: string): Promise<void> {
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink()) throw new SandboxPathError("path is a symbolic link");
    } catch (error) {
      if (error instanceof SandboxPathError) throw error;
      // The file not existing yet is fine; a write creates it.
    }
  }

  async writeFile(relativePath: string, contents: Uint8Array | string): Promise<void> {
    const bytes = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
    if (bytes.byteLength > this.limits.fileBytes) {
      throw new SandboxLimitError("file exceeds the per-file limit");
    }
    const target = await this.resolvePath(relativePath);
    const used = await this.usage();
    if (used + bytes.byteLength > this.limits.totalBytes) {
      throw new SandboxLimitError("workspace exceeds its total size limit");
    }
    await mkdir(dirname(target), { recursive: true });
    await this.assertNotLink(target);
    const handle = await open(target, writeFlags as never);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  }

  async readFile(relativePath: string): Promise<Uint8Array> {
    const target = await this.resolvePath(relativePath);
    await this.assertNotLink(target);
    const handle = await open(target, readFlags as never);
    try {
      // Stat through the open handle, so the size checked is the file being read.
      const info = await handle.stat();
      if (!info.isFile()) throw new SandboxPathError("path is not a file");
      if (info.size > this.limits.fileBytes) throw new SandboxLimitError("file exceeds the per-file limit");
      return new Uint8Array(await handle.readFile());
    } finally {
      await handle.close();
    }
  }

  /** Reads a file and describes where it came from, so an artifact can be traced to its run. */
  async exportArtifact(relativePath: string): Promise<{ bytes: Uint8Array; provenance: ArtifactProvenance }> {
    const bytes = await this.readFile(relativePath);
    return {
      bytes,
      provenance: {
        path: relativePath,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        dossierId: this.dossierId,
        runId: this.runId,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  // Walks the tree on every write. Fine for the handful of files a run produces; track a
  // running total if a run ever writes enough for the walk to show up.
  private async usage(): Promise<number> {
    let total = 0;
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const child = join(directory, entry.name);
        if (entry.isDirectory()) await walk(child);
        else if (entry.isFile()) total += (await stat(child)).size;
      }
    };
    await walk(this.root);
    return total;
  }

  /**
   * Deletes the workspace. Retention is the caller's decision: keep the directory to let a
   * user download artifacts after a run, and remove it once those artifacts are stored
   * elsewhere or the dossier is closed.
   */
  async destroy(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
