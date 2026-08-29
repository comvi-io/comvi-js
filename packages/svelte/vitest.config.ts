import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
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
 * All five entries move together — mixing a dev base host with a prod
 * `attachLoader` would compose across two different terser nameCaches and
 * break core's `_`-internal contract. `-rich-text` is in the list because
 * `<T>` names it; `-tags` stays because an app (or a fixture) may still opt
 * into the ambient entry, and a mixed pair there would mean two copies of the
 * grammar and two ambient registries.
 */
const coreBuild = (suffix: "" | ".dev") =>
  (["", "-loader", "-plugins", "-rich-text", "-tags"] as const).map((entry) => ({
    find: new RegExp(`^@comvi/core${entry === "" ? "" : `/${entry.slice(1)}`}$`),
    replacement: `${CORE_DIST}/comvi-core${entry}${suffix}.js`,
  }));

const shared = {
  plugins: [svelte({ compilerOptions: { dev: true } })],
};

const jsContract = {
  environment: "happy-dom" as const,
  globals: true,
  include: ["tests/js-contract/**/*.test.js"],
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.svelte"],
      exclude: ["tests/**", "node_modules/**", "dist/**"],
    },
    projects: [
      {
        ...shared,
        resolve: { conditions: ["browser"] },
        test: {
          name: "unit",
          environment: "happy-dom",
          globals: true,
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        ...shared,
        resolve: { alias: coreBuild(".dev"), conditions: ["browser"] },
        define: { __COMVI_CORE_BUILD__: JSON.stringify("development") },
        test: { ...jsContract, name: "js-contract-dev" },
      },
      {
        ...shared,
        resolve: { alias: coreBuild(""), conditions: ["browser"] },
        define: { __COMVI_CORE_BUILD__: JSON.stringify("production") },
        test: { ...jsContract, name: "js-contract-prod" },
      },
    ],
  },
});
