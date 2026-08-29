import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const CORE_DIST = resolve(__dirname, "../core/dist");

/**
 * Pin every `@comvi/core*` specifier — the wrapper's own imports included — to
 * ONE published build family.
 *
 * The JS-consumer contract must be proved under BOTH build conditions: the
 * only difference between them is the text `missingCapability()` throws, and
 * `__DEV__` bakes that into the core artifact at build time. Exact-match
 * regexes, never string prefixes, which would swallow the subpaths too.
 *
 * All five entries move together: mixing a dev base host with a prod
 * `attachLoader` composes across two terser nameCaches and breaks core's
 * `_`-internal contract. `-tags` is in the list because an app or fixture may
 * opt into the ambient entry, and a mixed pair there means two copies of the
 * grammar and two ambient registries.
 */
const coreBuild = (suffix: "" | ".dev") =>
  (["", "-loader", "-plugins", "-rich-text", "-tags"] as const).map((entry) => ({
    find: new RegExp(`^@comvi/core${entry === "" ? "" : `/${entry.slice(1)}`}$`),
    replacement: `${CORE_DIST}/comvi-core${entry}${suffix}.js`,
  }));

const shared = {
  plugins: [react()],
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
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
  include: ["tests/js-contract/**/*.test.jsx"],
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "tests/**",
        "**/*.test.tsx",
        "**/*.test.ts",
        "vite.config.ts",
        "vitest.config.ts",
      ],
    },
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          globals: true,
          restoreMocks: true,
          unstubEnvs: true,
          unstubGlobals: true,
          environment: "happy-dom",
          include: ["tests/**/*.test.{ts,tsx}"],
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
