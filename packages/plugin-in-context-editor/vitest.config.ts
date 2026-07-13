import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/types/**",
        "src/types.ts",
        "src/vite-env.d.ts",
        "src/App.vue",
        "src/components/**/*.vue", // Vue components will be tested via E2E
        "src/components/**/index.ts", // UI library barrels
        "src/collector/index.ts",
        "src/config/index.ts",
        "src/utils/index.ts",
        "src/entry-development.ts", // Build-condition shim; behavior is covered through package contracts
        "src/entry-production.ts", // Build-condition shim; behavior is covered through package contracts
      ],
      thresholds: {
        // Raised gate after expanding coverage for runtime modules and services.
        lines: 85,
        functions: 85,
        branches: 65,
        statements: 85,
      },
    },
    // Performance and debugging
    pool: "forks",
    // Reporting
    reporters: ["verbose"],
    outputFile: {
      json: "./coverage/test-results.json",
    },
  },
});
