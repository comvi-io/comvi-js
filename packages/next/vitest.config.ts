import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { dirname, resolve } from "path";

// `@comvi/react` from its source, so the tests and the Next provider share one module (one
// React context). `@comvi/core` resolves to its built entries for both.
const REACT_SRC = resolve(
  dirname(createRequire(import.meta.url).resolve("@comvi/react")),
  "../src/index.ts",
);
// `src/server.ts` imports `server-only`, whose default export condition THROWS (only
// `react-server` resolves it to an empty module). Vitest is not a react-server graph, so the
// tests take the empty half; `tests/dist/server-only-guard.dist.test.ts` proves the import
// ships in the built entry.
const SERVER_ONLY = resolve(
  dirname(createRequire(import.meta.url).resolve("server-only")),
  "empty.js",
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: resolve(__dirname, "./src") },
      { find: /^server-only$/, replacement: SERVER_ONLY },
      { find: /^@comvi\/react$/, replacement: REACT_SRC },
    ],
  },
  define: { __DEV__: JSON.stringify(true) },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/server.ts",
        "src/client.ts",
        "src/middleware.ts",
        "src/proxy.ts",
        "src/routing.ts",
        "src/navigation.ts",
        "src/**/types.ts",
      ],
    },
  },
});
