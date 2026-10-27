import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * The binding and the core run from SOURCE, as one module graph (one CORE seam, one
 * React context). Two projects, split by build condition like core: `unit` with
 * `__DEV__` true (development diagnostics), `prod` with `__DEV__` false.
 * tests/contracts reads the BUILT dist of core and react (turbo builds before test).
 */
const CORE = resolve(import.meta.dirname, "../core/src");
const alias = [
  { find: /^@comvi\/core$/, replacement: `${CORE}/index.ts` },
  { find: /^@comvi\/core\/(.*)$/, replacement: `${CORE}/$1.ts` },
];
const shared = {
  environment: "happy-dom" as const,
  setupFiles: ["./tests/setup.ts"],
  globals: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

export default defineConfig({
  test: {
    coverage: { provider: "v8", reporter: ["text", "json", "html"], include: ["src/**/*.ts"] },
    projects: [
      {
        resolve: { alias },
        define: { __DEV__: "true", __VERSION__: '"0.0.0-test"' },
        test: {
          ...shared,
          name: "unit",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/prod/**", "tests/**/*.node.test.tsx"],
        },
      },
      {
        resolve: { alias },
        define: { __DEV__: "true", __VERSION__: '"0.0.0-test"' },
        test: {
          ...shared,
          environment: "node",
          name: "node",
          include: ["tests/**/*.node.test.tsx"],
        },
      },
      {
        resolve: { alias },
        define: { __DEV__: "false", __VERSION__: '"0.0.0-test"' },
        test: { ...shared, name: "prod", include: ["tests/prod/**/*.test.{ts,tsx}"] },
      },
    ],
  },
});
