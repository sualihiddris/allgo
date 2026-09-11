import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/e2e/**/*.e2e.test.ts",
    ],
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
