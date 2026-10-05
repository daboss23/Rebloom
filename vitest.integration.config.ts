import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Runs against the real Supabase project in the environment. Creates a throwaway sandbox and removes it.
export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
