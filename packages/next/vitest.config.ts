import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}"],
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
      // Map @comvi/react to its source so tests and the Next I18nProvider source
      // share the same module instance (and therefore the same React context
      // objects). Without this, dist/ and src/ load as separate modules and
      // hooks cannot find the provider context.
      "@comvi/react": resolve(__dirname, "../react/src/index.ts"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
});
