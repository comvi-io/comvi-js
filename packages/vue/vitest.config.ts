import { defineConfig } from "vitest/config";
import { resolve } from "path";

const CORE_DIST = resolve(__dirname, "../core/dist");

/**
 * Pin every `@comvi/core*` specifier — the wrapper's own imports included — to
 * ONE published build family.
 *
 * The §2.4 JS-consumer contract has to be proved under BOTH build conditions,
 * because the only difference between them is the text `missingCapability()`
 * throws, and that text is baked into the core artifact at build time
 * (`__DEV__`). Exact-match regexes, never string prefixes: a string alias for
 * `@comvi/core` would also swallow `@comvi/core`.
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

const shared = {
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
};

const jsContract = {
  environment: "happy-dom" as const,
  globals: true,
  include: ["tests/js-contract/**/*.test.js"],
};

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          globals: true,
          environment: "happy-dom",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        ...shared,
        resolve: { ...shared.resolve, alias: coreBuild(".dev") },
        define: { ...shared.define, __COMVI_CORE_BUILD__: JSON.stringify("development") },
        test: { ...jsContract, name: "js-contract-dev" },
      },
      {
        ...shared,
        resolve: { ...shared.resolve, alias: coreBuild("") },
        define: {
          __DEV__: JSON.stringify(false),
          __COMVI_CORE_BUILD__: JSON.stringify("production"),
        },
        test: { ...jsContract, name: "js-contract-prod" },
      },
    ],
  },
});
