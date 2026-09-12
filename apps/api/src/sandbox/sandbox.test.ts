import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildRunArguments, DockerRunner, defaultRunLimits } from "./runner";
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
      expect(Workspace.create(base, bad, "run1")).rejects.toBeInstanceOf(SandboxPathError);
    }
  });

  test("refuses a relative path that climbs out of the workspace", async () => {
    const space = await workspace("dossier2");
    for (const bad of ["../secret", "nested/../../secret", "./../../secret"]) {
      expect(space.resolvePath(bad)).rejects.toBeInstanceOf(SandboxPathError);
    }
  });

  test("refuses an absolute path", async () => {
    const space = await workspace("dossier3");
    expect(space.resolvePath("/etc/passwd")).rejects.toBeInstanceOf(SandboxPathError);
    expect(space.resolvePath("C:/Windows/win.ini")).rejects.toBeInstanceOf(SandboxPathError);
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
    expect(space.resolvePath("link.txt")).rejects.toBeInstanceOf(SandboxPathError);
    expect(space.readFile("link.txt")).rejects.toBeInstanceOf(SandboxPathError);
  });

  test("one dossier cannot reach another dossier's files by path", async () => {
    const first = await workspace("dossieralpha", "runa");
    const second = await workspace("dossierbeta", "runb");
    await first.writeFile("private.txt", "alpha only");

    expect(first.root).not.toBe(second.root);
    expect(second.resolvePath("../../dossieralpha/runa/private.txt")).rejects.toBeInstanceOf(SandboxPathError);
  });

  test("keeps a file written and read through the workspace", async () => {
    const space = await workspace("dossier5");
    await space.writeFile("nested/report.txt", "bonjour");
    expect(new TextDecoder().decode(await space.readFile("nested/report.txt"))).toBe("bonjour");
    expect(await space.resolvePath("nested/report.txt")).toStartWith(space.root);
  });

  test("enforces the per-file and total size limits", async () => {
    const space = await Workspace.create(base, "dossier6", "run1", { fileBytes: 64, totalBytes: 128 });
    expect(space.writeFile("big.txt", "x".repeat(65))).rejects.toBeInstanceOf(SandboxLimitError);

    await space.writeFile("a.txt", "x".repeat(64));
    await space.writeFile("b.txt", "x".repeat(64));
    expect(space.writeFile("c.txt", "x")).rejects.toBeInstanceOf(SandboxLimitError);
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
    expect(space.readFile("temp.txt")).rejects.toBeTruthy();
  });
});

describe("container restrictions", () => {
  test("the run is confined and mounts only this workspace", async () => {
    const space = await workspace("dossier9");
    const args = buildRunArguments(space, ["echo", "hello"], "alpine:3.20", defaultRunLimits, "h4j-test");
    const joined = args.join(" ");

    expect(joined).toContain("--network none");
    expect(joined).toContain("--user 65534:65534");
    expect(joined).toContain("--cap-drop ALL");
    expect(joined).toContain("--security-opt no-new-privileges");
    expect(joined).toContain("--read-only");
    expect(joined).toContain("--pids-limit 128");
    expect(joined).toContain("--memory 512m");
    expect(joined).toContain("--memory-swap 512m");

    expect(joined).not.toContain("--privileged");
    expect(joined).not.toContain("docker.sock");
    expect(joined).not.toContain("--cap-add");
    expect(joined).not.toContain("--pid host");

    const mounts = args.filter((value, index) => args[index - 1] === "--volume");
    expect(mounts).toEqual([`${space.root}:/work:rw`]);
  });

  test("an empty command is refused", async () => {
    const space = await workspace("dossier10");
    expect(() => buildRunArguments(space, [], "alpine:3.20", defaultRunLimits, "h4j-test")).toThrow();
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
    expect(result.stdout.trim()).toBe("65534");
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

  test("output beyond the limit is dropped and flagged", async () => {
    const space = await Workspace.create(base, "live8", `run${randomUUID().slice(0, 8)}`);
    const small = new DockerRunner(image, { ...defaultRunLimits, outputBytes: 1024 });

    const result = await small.run(space, ["sh", "-c", "yes abcdefghij | head -c 200000"]);

    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1024);
  }, 120_000);
});
