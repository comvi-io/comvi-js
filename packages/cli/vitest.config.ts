import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Build-artifact tests drive the built bin in a subprocess; under Stryker
    // the mutated src is never rebuilt, so they can kill no mutants.
    exclude: process.env.COMVI_MUTATION ? ["tests/dist/**"] : [],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/**", "dist/**", "tests/**", "**/*.config.{js,ts}", "**/bin/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
