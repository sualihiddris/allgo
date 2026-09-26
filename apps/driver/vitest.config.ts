import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
  resolve: {
    alias: { "@allgo/shared": path.resolve(__dirname, "../../shared") },
  },
});
