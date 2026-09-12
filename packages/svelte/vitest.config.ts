import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "path";

// Resolve core's dist through node_modules, not a relative path: inside a Stryker
// sandbox (.stryker-tmp/sandbox-*) the package is copied, so "../core" does not
// exist — but the node_modules symlink chain still reaches the real workspace.
const CORE_DIST = dirname(createRequire(import.meta.url).resolve("@comvi/core"));

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

/**
 * `#dev-warn` is resolved through the package.json `imports` map, whose
 * targets are `dist/` files — built by `svelte-package`, which these
 * source-level tests deliberately do not depend on. Alias it to the
 * DEVELOPMENT half: that is the one a consumer gets under the `development`
 * condition, and it is the half whose warning the `<T raw>` tests assert.
 * The production half is covered on the DIST, by the bundler-matrix
 * `*-dev-conditions` cases, and its export surface by tests/dev-warn.test.ts.
 */
const DEV_WARN_ALIAS = {
  find: "#dev-warn",
  // Relative to THIS file, not the cwd: a Stryker sandbox runs from elsewhere.
  replacement: resolve(dirname(fileURLToPath(import.meta.url)), "src/dev-warn.dev.ts"),
};

const shared = {
  plugins: [svelte({ compilerOptions: { dev: true } })],
};

// A FUNCTION, not a shared object: `unit` and `ssr` both spread `...shared`
// and neither overrides `define` afterward, so a single `shared.define`
// object would end up as the SAME reference on two project configs. Vitest
// resolves projects concurrently, and observed flaky (~20-30% of runs, with
// no svelte-specific code involved at all — a bare `.ts` module reading its
// own `declare const __DEV__` sometimes saw it unsubstituted): one project's
// in-place config normalization racing the other's read of the SAME mutable
// object is the only shape that explains an intermittent, all-or-nothing
// wrong value with no other varying input. Each project gets its own object
// now, so there is nothing left to race.
const freshDefine = () => ({ __DEV__: JSON.stringify(true) });

const jsContract = {
  environment: "happy-dom" as const,
  globals: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
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
        define: freshDefine(),
        resolve: { alias: [DEV_WARN_ALIAS], conditions: ["browser"] },
        test: {
          name: "unit",
          environment: "happy-dom",
          globals: true,
          restoreMocks: true,
          unstubEnvs: true,
          unstubGlobals: true,
          include: ["tests/**/*.test.ts"],
          // tests/ssr needs server-compiled components — see the `ssr` project.
          // exports-smoke rebuilds dist in beforeAll and asserts on the artefact —
          // meaningless (and ruinously slow) against mutated src under Stryker.
          exclude: process.env.COMVI_MUTATION
            ? ["tests/ssr/**", "tests/exports-smoke.test.ts"]
            : ["tests/ssr/**"],
        },
      },
      {
        // `svelte/server` render() needs SERVER-compiled components, which the
        // `unit` project cannot produce: its `resolve.conditions: ["browser"]`
        // compiles .svelte files for the client and reading `result.body` then
        // fails on the absent browser reactive machinery. Node environment, so
        // vitest transforms in ssr mode.
        ...shared,
        define: freshDefine(),
        resolve: { alias: [DEV_WARN_ALIAS], conditions: ["svelte", "node"] },
        test: {
          name: "ssr",
          environment: "node",
          globals: true,
          restoreMocks: true,
          include: ["tests/ssr/**/*.test.ts"],
        },
      },
      {
        ...shared,
        resolve: { alias: [...coreBuild(".dev"), DEV_WARN_ALIAS], conditions: ["browser"] },
        define: { ...freshDefine(), __COMVI_CORE_BUILD__: JSON.stringify("development") },
        test: { ...jsContract, name: "js-contract-dev" },
      },
      {
        ...shared,
        resolve: { alias: [...coreBuild(""), DEV_WARN_ALIAS], conditions: ["browser"] },
        define: {
          __DEV__: JSON.stringify(false),
          __COMVI_CORE_BUILD__: JSON.stringify("production"),
        },
        test: { ...jsContract, name: "js-contract-prod" },
      },
    ],
  },
});
