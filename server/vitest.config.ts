import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Every Colyseus test server binds the same port, so suites that boot one
    // cannot run side by side.
    fileParallelism: false,
  },
});
