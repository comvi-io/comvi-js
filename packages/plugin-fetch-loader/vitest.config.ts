import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify("http://localhost:3000"),
    "import.meta.env.VITE_CDN_BASE_URL": JSON.stringify("https://cdn.thebestfrontend.com"),
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/types.ts",
        "**/index.ts", // Re-export file
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
