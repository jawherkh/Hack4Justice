import { spawn } from "node:child_process";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

while (true) {
  const exitCode = await new Promise((resolve) => {
    const worker = spawn("pnpm", ["--filter", "@hack4justice/api", "worker"], {
      stdio: "inherit",
      env: process.env,
    });
    process.on("SIGTERM", () => worker.kill("SIGTERM"));
    process.on("SIGINT", () => worker.kill("SIGINT"));
    worker.on("exit", (code) => resolve(code ?? 1));
  });
  console.log(`Temporal worker stopped with code ${exitCode}; retrying in 5 seconds`);
  await sleep(5000);
}

