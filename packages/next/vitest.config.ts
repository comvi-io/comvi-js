import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/index.ts",
        "src/server.ts",
        "src/client.ts",
        "src/middleware.ts",
        "src/routing.ts",
        "src/navigation.ts",
        "src/**/types.ts",
        "src/**/index.ts",
      ],
    },
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
});
