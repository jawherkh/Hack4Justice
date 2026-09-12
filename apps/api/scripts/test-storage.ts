if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a disposable local PostgreSQL database");
const child = Bun.spawn([process.execPath, "test"], { stdout: "inherit", stderr: "inherit", env: process.env });
process.exitCode = await child.exited;
