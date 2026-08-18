import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    exclude: ["node_modules", ".next"],
    // Supabase integration tests share one live database across test files.
    // Running files in parallel lets one file's cleanup (e.g. deleting all
    // studies before each of its tests) delete another file's fixtures
    // mid-run. The in-memory suites are unaffected — each gets a fresh
    // instance — so serializing everything costs only a few seconds.
    fileParallelism: false,
  },
});
