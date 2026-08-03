import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const CORE_DIST = resolve(__dirname, "../core/dist");
// Map @comvi/react to its source so tests and the Next I18nProvider source
// share the same module instance (and therefore the same React context
// objects). Without this, dist/ and src/ load as separate modules and
// hooks cannot find the provider context.
const REACT_SRC = resolve(__dirname, "../react/src/index.ts");
const SRC_ALIAS = { find: "@", replacement: resolve(__dirname, "./src") };

/**
 * Pin every `@comvi/core*` specifier — next's own imports, and react's
 * through the source alias — to ONE published build family.
 *
 * The §2.4 JS-consumer contract and P5's loud server-cell errors both have to
 * hold under BOTH build conditions; the only way to prove a message is not
 * stripped in production is to run the same file against the production
 * artifact with `__DEV__` false. Exact-match regexes, never string prefixes: a
 * string alias for `@comvi/core` would also swallow `@comvi/core`.
 *
 * All four entries move together — mixing a dev base host with a prod
 * `attachLoader` would compose across two different terser nameCaches and
 * break core's `_`-internal contract.
 */
const coreBuild = (suffix: "" | ".dev") =>
  (["", "-loader", "-plugins", "-tags"] as const).map((entry) => ({
    find: new RegExp(`^@comvi/core${entry === "" ? "" : `/${entry.slice(1)}`}$`),
    replacement: `${CORE_DIST}/comvi-core${entry}${suffix}.js`,
  }));

const jsContract = (suffix: "" | ".dev") => ({
  plugins: [react()],
  resolve: {
    alias: [SRC_ALIAS, { find: /^@comvi\/react$/, replacement: REACT_SRC }, ...coreBuild(suffix)],
  },
  define: {
    __DEV__: JSON.stringify(suffix === ".dev"),
    __COMVI_CORE_BUILD__: JSON.stringify(suffix === ".dev" ? "development" : "production"),
  },
  test: {
    name: suffix === ".dev" ? ("js-contract-dev" as const) : ("js-contract-prod" as const),
    environment: "happy-dom" as const,
    globals: true,
    include: ["tests/js-contract/**/*.test.jsx"],
  },
});

export default defineConfig({
  test: {
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
    projects: [
      {
        resolve: { alias: [SRC_ALIAS, { find: /^@comvi\/react$/, replacement: REACT_SRC }] },
        define: { __DEV__: JSON.stringify(true) },
        test: {
          name: "unit",
          environment: "happy-dom",
          include: ["tests/**/*.test.{ts,tsx}"],
          globals: true,
        },
      },
      jsContract(".dev"),
      jsContract(""),
    ],
  },
});
