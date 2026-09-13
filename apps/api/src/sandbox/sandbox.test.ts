import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendOutputChunk, buildRunArguments, defaultContainerUser, DockerRunner, defaultRunLimits } from "./runner";
import { SandboxLimitError, SandboxPathError, Workspace } from "./workspace";

let base: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "h4j-sandbox-"));
});

afterAll(async () => {
  if (base) await rm(base, { recursive: true, force: true });
});

const workspace = (dossier = "dossier1", run = "run1") => Workspace.create(base, dossier, run);

describe("workspace containment", () => {
  test("rejects identifiers that could alter a path or a container name", async () => {
    for (const bad of ["../escape", "a/b", "with space", "", "x".repeat(80), "semi;colon"]) {
      await expect(Workspace.create(base, bad, "run1")).rejects.toBeInstanceOf(SandboxPathError);
    }
  });

  test("refuses a relative path that climbs out of the workspace", async () => {
    const space = await workspace("dossier2");
    for (const bad of ["../secret", "nested/../../secret", "./../../secret"]) {
      await expect(space.resolvePath(bad)).rejects.toBeInstanceOf(SandboxPathError);
    }
  });

  test("refuses an absolute path", async () => {
    const space = await workspace("dossier3");
    await expect(space.resolvePath("/etc/passwd")).rejects.toBeInstanceOf(SandboxPathError);
    await expect(space.resolvePath("C:/Windows/win.ini")).rejects.toBeInstanceOf(SandboxPathError);
  });

  test("refuses a pre-existing run root that is a symbolic link", async () => {
    const outside = await mkdtemp(join(tmpdir(), "h4j-sandbox-outside-"));
    const parent = join(base, "dossier-root-link");
    await mkdir(parent, { recursive: true });
    try {
      await symlink(outside, join(parent, "run-root-link"), "dir");
    } catch {
      await rm(outside, { recursive: true, force: true });
      return; // creating links can require a privilege the test runner lacks
    }

    await expect(Workspace.create(base, "dossier-root-link", "run-root-link"))
      .rejects.toBeInstanceOf(SandboxPathError);
    await rm(outside, { recursive: true, force: true });
  });

  test("keeps workspace directories and files private to the API user", async () => {
    const space = await workspace("dossier-private", "run-private");
    await space.writeFile("nested/deep/secret.txt", "secret");

    expect((await stat(join(base, "dossier-private"))).mode & 0o777).toBe(0o700);
    expect((await stat(space.root)).mode & 0o777).toBe(0o700);
    expect((await stat(join(space.root, "nested"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(space.root, "nested/deep"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(space.root, "nested/deep/secret.txt"))).mode & 0o777).toBe(0o600);
  });

  test("refuses a path that leaves through a symbolic link", async () => {
    const space = await workspace("dossier4");
    const outside = join(base, "outside-secret.txt");
    await writeFile(outside, "not for the sandbox");
    try {
      await symlink(outside, join(space.root, "link.txt"));
    } catch {
      return; // creating links can require a privilege the test runner lacks
    }
    await expect(space.resolvePath("link.txt")).rejects.toBeInstanceOf(SandboxPathError);
    await expect(space.readFile("link.txt")).rejects.toBeInstanceOf(SandboxPathError);
  });

  test("refuses to write through a link planted at the target path", async () => {
    const space = await workspace("dossier4b");
    const outside = join(base, "write-target.txt");
    await writeFile(outside, "original");
    try {
      await symlink(outside, join(space.root, "swapped.txt"));
    } catch {
      return; // creating links can require a privilege the test runner lacks
    }

    await expect(space.writeFile("swapped.txt", "overwritten")).rejects.toBeInstanceOf(SandboxPathError);
    expect(new TextDecoder().decode(await readFile(outside))).toBe("original");
  });

  test("refuses a path that passes through a linked parent directory", async () => {
    const space = await workspace("dossier4c");
    const outside = join(base, "linked-parent");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "final.txt"), "outside content");
    try {
      await symlink(outside, join(space.root, "out"), "dir");
    } catch {
      return; // creating links can require a privilege the test runner lacks
    }

    await expect(space.resolvePath("out/final.txt")).rejects.toBeInstanceOf(SandboxPathError);
    await expect(space.readFile("out/final.txt")).rejects.toBeInstanceOf(SandboxPathError);
    await expect(space.writeFile("out/final.txt", "overwritten")).rejects.toBeInstanceOf(SandboxPathError);
    expect(new TextDecoder().decode(await readFile(join(outside, "final.txt")))).toBe("outside content");
  });

  test("a refused write leaves an existing file outside the workspace intact", async () => {
    const space = await workspace("dossier4d");
    const outside = join(base, "must-survive.txt");
    await writeFile(outside, "valuable contents");
    try {
      await symlink(outside, join(space.root, "decoy.txt"));
    } catch {
      return; // creating links can require a privilege the test runner lacks
    }

    await expect(space.writeFile("decoy.txt", "x")).rejects.toBeInstanceOf(SandboxPathError);
    // Opening for a write must not empty the target before the path is refused.
    expect(new TextDecoder().decode(await readFile(outside))).toBe("valuable contents");
  });

  test("a path written with backslashes is still checked one part at a time", async () => {
    const space = await workspace("dossier4e");
    const outside = join(base, "backslash-parent");
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "inner.txt"), "outside content");
    try {
      await symlink(outside, join(space.root, "parent"), "dir");
    } catch {
      return;
    }

    await expect(space.resolvePath("parent\\inner.txt")).rejects.toBeInstanceOf(SandboxPathError);
    await expect(space.readFile("parent\\inner.txt")).rejects.toBeInstanceOf(SandboxPathError);
  });

  test("one dossier cannot reach another dossier's files by path", async () => {
    const first = await workspace("dossieralpha", "runa");
    const second = await workspace("dossierbeta", "runb");
    await first.writeFile("private.txt", "alpha only");

    expect(first.root).not.toBe(second.root);
    await expect(second.resolvePath("../../dossieralpha/runa/private.txt")).rejects.toBeInstanceOf(SandboxPathError);
  });

  test("keeps a file written and read through the workspace", async () => {
    const space = await workspace("dossier5");
    await space.writeFile("nested/report.txt", "bonjour");
    expect(new TextDecoder().decode(await space.readFile("nested/report.txt"))).toBe("bonjour");
    expect((await space.resolvePath("nested/report.txt")).startsWith(space.root)).toBe(true);
  });

  test("enforces the per-file and total size limits", async () => {
    const space = await Workspace.create(base, "dossier6", "run1", { fileBytes: 64, totalBytes: 128 });
    await expect(space.writeFile("big.txt", "x".repeat(65))).rejects.toBeInstanceOf(SandboxLimitError);

    await space.writeFile("a.txt", "x".repeat(64));
    await space.writeFile("b.txt", "x".repeat(64));
    await expect(space.writeFile("c.txt", "x")).rejects.toBeInstanceOf(SandboxLimitError);
  });

  test("refuses to read anything that is not a plain file", async () => {
    const space = await workspace("dossier5b");
    await mkdir(join(space.root, "adirectory"), { recursive: true });

    // The type is checked before the open, so a pipe left by a run cannot make the reader
    // wait for a writer that never arrives. A directory stands in for that check here,
    // since it is a non-regular file on every platform.
    await expect(space.readFile("adirectory")).rejects.toThrow("path is not a regular file");
  });

  test("an exported artifact carries its checksum and origin", async () => {
    const space = await workspace("dossier7");
    await space.writeFile("out/final.txt", "artifact");
    const { bytes, provenance } = await space.exportArtifact("out/final.txt");

    expect(new TextDecoder().decode(bytes)).toBe("artifact");
    expect(provenance).toMatchObject({ path: "out/final.txt", bytes: 8, dossierId: "dossier7", runId: "run1" });
    expect(provenance.sha256).toBe(createHash("sha256").update("artifact").digest("hex"));
  });

  test("destroy removes the workspace", async () => {
    const space = await workspace("dossier8");
    await space.writeFile("temp.txt", "temporary");
    await space.destroy();
    await expect(space.readFile("temp.txt")).rejects.toBeTruthy();
  });
});

describe("container restrictions", () => {
  test("the run is confined and mounts only this workspace", async () => {
    const space = await workspace("dossier9");
    const args = buildRunArguments(space, ["echo", "hello"], "alpine:3.20", defaultRunLimits, "h4j-test");
    const joined = args.join(" ");

    expect(joined).toContain("--network none");
    expect(joined).toContain(`--user ${defaultContainerUser}`);
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("--security-opt no-new-privileges");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--pids-limit 128");
    expect(joined).toContain("--ulimit fsize=10485760:10485760");
    expect(joined).toContain("--ulimit nofile=256:256");
    expect(joined).toContain("--memory 512m");
    expect(joined).toContain("--memory-swap 512m");

    expect(joined).not.toContain("--privileged");
    expect(joined).not.toContain("docker.sock");
    expect(joined).not.toContain("--cap-add");
    expect(joined).not.toContain("--pid host");

    const mounts = args.filter((value, index) => args[index - 1] === "--volume");
    expect(mounts).toEqual([`${space.root}:/work:rw`]);
  });

  test("does not let the container file limit exceed the workspace file limit", async () => {
    const space = await Workspace.create(base, "dossier-limit", "run-limit", {
      fileBytes: 1024,
      totalBytes: 2048,
    });
    const args = buildRunArguments(space, ["echo", "hello"], "alpine:3.20", defaultRunLimits, "h4j-limit");

    expect(args).toContain("--ulimit");
    expect(args).toContain("fsize=1024:1024");
  });

  test("an empty command is refused", async () => {
    const space = await workspace("dossier10");
    expect(() => buildRunArguments(space, [], "alpine:3.20", defaultRunLimits, "h4j-test")).toThrow();
  });

  test("counts captured output in UTF-8 bytes", () => {
    const output = { stdout: "", stderr: "", bytes: 0, truncated: false };
    appendOutputChunk(output, "stdout", new TextEncoder().encode("€€"), 4);

    expect(output.truncated).toBe(true);
    expect(Buffer.byteLength(output.stdout, "utf8")).toBeLessThanOrEqual(4);
  });
});

// Docker is not present on every machine, so the live checks run on request. They use only
// a local daemon and a public base image, and contact no project service.
const live = process.env.SANDBOX_DOCKER_TESTS ? describe : describe.skip;
const image = process.env.SANDBOX_IMAGE ?? "alpine:3.20";

live("container isolation against a real daemon", () => {
  const runner = new DockerRunner(image, { ...defaultRunLimits, timeoutMs: 20_000 });

  test("runs a command against the workspace", async () => {
    const space = await Workspace.create(base, "live1", `run${randomUUID().slice(0, 8)}`);
    await space.writeFile("input.txt", "from the host");

    const result = await runner.run(space, ["cat", "input.txt"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("from the host");
    expect(result.timedOut).toBe(false);
  }, 120_000);

  test("a file written inside the container is visible to the host", async () => {
    const space = await Workspace.create(base, "live2", `run${randomUUID().slice(0, 8)}`);

    const result = await runner.run(space, ["sh", "-c", "echo generated > produced.txt"]);
    expect(result.exitCode).toBe(0);

    const { provenance } = await space.exportArtifact("produced.txt");
    expect(provenance.sha256).toMatch(/^[a-f0-9]{64}$/);
  }, 120_000);

  test("the process is not root", async () => {
    const space = await Workspace.create(base, "live3", `run${randomUUID().slice(0, 8)}`);
    const result = await runner.run(space, ["id", "-u"]);
    expect(result.stdout.trim()).toBe(defaultContainerUser.split(":")[0]);
  }, 120_000);

  test("outbound network access is blocked", async () => {
    const space = await Workspace.create(base, "live4", `run${randomUUID().slice(0, 8)}`);
    const result = await runner.run(space, ["sh", "-c", "wget -T 3 -q -O - http://example.com || echo BLOCKED"]);
    expect(result.stdout).toContain("BLOCKED");
  }, 120_000);

  test("the image filesystem is read-only outside the workspace", async () => {
    const space = await Workspace.create(base, "live5", `run${randomUUID().slice(0, 8)}`);
    const result = await runner.run(space, ["sh", "-c", "touch /etc/intruder 2>&1 || echo REFUSED"]);
    expect(result.stdout).toContain("REFUSED");
  }, 120_000);

  test("another dossier's workspace is not mounted", async () => {
    const other = await Workspace.create(base, "live6other", `run${randomUUID().slice(0, 8)}`);
    await other.writeFile("secret.txt", "other dossier");
    const space = await Workspace.create(base, "live6", `run${randomUUID().slice(0, 8)}`);

    const result = await runner.run(space, ["sh", "-c", "ls /work; cat /work/../secret.txt 2>&1 || echo NOT_FOUND"]);

    expect(result.stdout).not.toContain("other dossier");
    expect(result.stdout).toContain("NOT_FOUND");
  }, 120_000);

  test("a runaway process is stopped at the time limit", async () => {
    const space = await Workspace.create(base, "live7", `run${randomUUID().slice(0, 8)}`);
    const quick = new DockerRunner(image, { ...defaultRunLimits, timeoutMs: 5_000 });

    const result = await quick.run(space, ["sh", "-c", "while true; do :; done"]);

    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(60_000);
  }, 120_000);

  test("the container cannot write a file larger than its limit", async () => {
    const space = await Workspace.create(base, "live9", `run${randomUUID().slice(0, 8)}`);
    const capped = new DockerRunner(image, { ...defaultRunLimits, fileBytes: 1024 * 1024, timeoutMs: 30_000 });

    // Without a file size limit this would keep writing into the host directory.
    const result = await capped.run(space, ["sh", "-c", "dd if=/dev/zero of=/work/big bs=1M count=64 2>&1; echo EXIT=$?"]);

    expect(result.stdout).toContain("EXIT=");
    expect(result.stdout).not.toContain("64+0 records out");
    const written = await stat(join(space.root, "big")).then((info) => info.size).catch(() => 0);
    expect(written).toBeLessThanOrEqual(1024 * 1024);
  }, 180_000);

  test("a pipe left where an artifact is expected does not hang the reader", async () => {
    const space = await Workspace.create(base, "live10", `run${randomUUID().slice(0, 8)}`);
    const made = await runner.run(space, ["sh", "-c", "mkfifo /work/report.pdf && ls -l /work"]);
    expect(made.exitCode).toBe(0);

    // Without the type check this waits for a writer that never comes.
    const read = space.readFile("report.pdf");
    const outcome = await Promise.race([
      read.then(() => "read").catch(() => "refused"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 5_000)),
    ]);
    expect(outcome).toBe("refused");
  }, 120_000);

  test("a run that fills its workspace past the total is stopped", async () => {
    const space = await Workspace.create(base, "live11", `run${randomUUID().slice(0, 8)}`, {
      fileBytes: 10 * 1024 * 1024,
      totalBytes: 4 * 1024 * 1024,
    });
    const capped = new DockerRunner(image, { ...defaultRunLimits, fileBytes: 2 * 1024 * 1024, timeoutMs: 60_000 });

    // Each file stays under the per-file limit, so only the total can stop this.
    const result = await capped.run(space, [
      "sh", "-c", "i=0; while [ $i -lt 60 ]; do dd if=/dev/zero of=/work/f$i bs=1M count=2 2>/dev/null; i=$((i+1)); done; echo FINISHED",
    ]);

    // The guarantee is that the run is stopped and reported, not a precise quota: polling
    // cannot catch a fast writer at the exact byte. It attempted 120MB.
    expect(result.limitExceeded).toBe(true);
    expect(result.stdout).not.toContain("FINISHED");
    expect(await space.usage()).toBeLessThan(120 * 1024 * 1024);
  }, 180_000);

  test("output beyond the limit is dropped and flagged", async () => {
    const space = await Workspace.create(base, "live8", `run${randomUUID().slice(0, 8)}`);
    const small = new DockerRunner(image, { ...defaultRunLimits, outputBytes: 1024 });

    const result = await small.run(space, ["sh", "-c", "yes abcdefghij | head -c 200000"]);

    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1024);
  }, 120_000);
});
