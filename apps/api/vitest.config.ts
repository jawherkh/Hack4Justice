import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // env.ts validates on import; these values are never used to connect
    // (persistent.test.ts needs TEST_DATABASE_URL and skips without it).
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
      LOG_LEVEL: "silent",
    },
  },
});
