import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    // dist/ is committed alongside src/ (see README) - exclude it so vitest doesn't also
    // try to run the compiled copy of the test files.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
