import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

/**
 * The binding and the core run from SOURCE, as one module graph (one CORE seam). Three
 * projects, as in @comvi/vue: `unit` (client build, happy-dom, development), `node` (server
 * build, no DOM) and `prod` (client build, production). `esm-env` (the binding's DEV and BROWSER)
 * reads the same conditions as Svelte's own runtime.
 */
const CORE = resolve(import.meta.dirname, "../core/src");
const alias = [
  { find: /^@comvi\/core$/, replacement: `${CORE}/index.ts` },
  { find: /^@comvi\/core\/(.*)$/, replacement: `${CORE}/$1.ts` },
];
const shared = {
  setupFiles: ["./tests/setup.ts"],
  globals: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};
const define = (dev: boolean) => ({ __DEV__: String(dev), __VERSION__: '"0.0.0-test"' });
const inlined = { server: { deps: { inline: ["esm-env"] } } };
// Vite picks esm-env's `development` while Node's mode is `test`, whatever `conditions` say.
const prodEnv = {
  find: /^esm-env$/,
  replacement: resolve(import.meta.dirname, "tests/prod/esm-env.ts"),
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.svelte"],
    },
    projects: [
      {
        plugins: [svelte({ compilerOptions: { dev: true } })],
        resolve: { alias, conditions: ["browser", "development"] },
        define: define(true),
        test: {
          ...shared,
          ...inlined,
          name: "unit",
          environment: "happy-dom",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/prod/**", "tests/**/*.node.test.ts"],
        },
      },
      {
        plugins: [svelte({ compilerOptions: { dev: true } })],
        resolve: { alias, conditions: ["node", "development"] },
        define: define(true),
        test: {
          ...shared,
          ...inlined,
          name: "node",
          environment: "node",
          include: ["tests/**/*.node.test.ts"],
        },
      },
      {
        plugins: [svelte({ compilerOptions: { dev: false } })],
        resolve: { alias: [...alias, prodEnv], conditions: ["browser", "production"] },
        define: define(false),
        test: {
          ...shared,
          ...inlined,
          name: "prod",
          environment: "happy-dom",
          include: ["tests/prod/**/*.test.ts"],
        },
      },
    ],
  },
});
