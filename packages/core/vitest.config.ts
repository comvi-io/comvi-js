import { defineConfig } from "vitest/config";
import { resolve } from "path";
import pkg from "./package.json";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    globals: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
  define: {
    __DEV__: JSON.stringify(true),
    __VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
