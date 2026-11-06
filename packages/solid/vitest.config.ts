import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { createRequire } from "node:module";
import { dirname, resolve } from "path";

/**
 * The binding and the core run from SOURCE, as one module graph (one CORE seam). Four
 * projects: `unit` (happy-dom, `__DEV__` true), `prod` (`__DEV__` false), `contracts` (the
 * BUILT dist of core and solid; turbo builds before test) and `ssr` (below).
 */
const CORE = resolve(import.meta.dirname, "../core/src");
const SOLID_ROOT = dirname(createRequire(import.meta.url).resolve("solid-js/package.json"));
const alias = [
  { find: /^@comvi\/core$/, replacement: `${CORE}/index.ts` },
  { find: /^@comvi\/core\/(.*)$/, replacement: `${CORE}/$1.ts` },
];
const conditions = ["development", "browser"];
const define = { __DEV__: "true", __VERSION__: '"0.0.0-test"' };
const shared = {
  environment: "happy-dom" as const,
  setupFiles: ["./tests/setup.ts"],
  globals: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

/** What makes a module SERVER-FLAVOURED in the `ssr` project. */
const SERVER = "?solid-server";

/**
 * A real hydration test needs one source compiled twice in one process: `generate: "ssr"`
 * against Solid's server build for the server render, `generate: "dom"` against the browser
 * build for `hydrate()`. Every relative import reached from a `*.server.tsx` fixture is tagged
 * with this query, which gives that subgraph its own module instances and selects it for the
 * ssr-generating plugin. `@comvi/core` stays one copy; `solid-js` and `solid-js/web` go to the
 * server builds, Solid's own server builds included (else they would drive the client core).
 */
const serverFlavour = () => {
  const IMPORTERS = [/\.server\.tsx$/, /\?solid-server/, /solid-js\/(web\/)?dist\/server\.js$/];
  return {
    name: "comvi-solid-server-flavour",
    enforce: "pre" as const,
    async resolveId(
      this: {
        resolve: (s: string, i: string, o: { skipSelf: boolean }) => Promise<{ id: string } | null>;
      },
      source: string,
      importer?: string,
    ) {
      if (!importer || !IMPORTERS.some((pattern) => pattern.test(importer))) return null;
      if (source === "solid-js/web") return `${SOLID_ROOT}/web/dist/server.js`;
      if (source === "solid-js") return `${SOLID_ROOT}/dist/server.js`;
      if (source.startsWith("/@") || source.startsWith(CORE) || !/^[./]/.test(source)) return null;
      const resolved = await this.resolve(source, importer.replace(SERVER, ""), {
        skipSelf: true,
      });
      return resolved ? `${resolved.id}${SERVER}` : null;
    },
  };
};

// Under Stryker (scripts/mutation/run.mjs sets COMVI_MUTATION) tests/contracts is left out:
// it reads the BUILT dist, never the mutated source.
const MUTATION = process.env.COMVI_MUTATION ? ["tests/contracts/**"] : [];

export default defineConfig({
  test: {
    coverage: { provider: "v8", reporter: ["text", "json", "html"], include: ["src/**/*.ts"] },
    projects: [
      {
        plugins: [solid()],
        resolve: { alias, conditions },
        define,
        test: {
          ...shared,
          name: "unit",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/prod/**", "tests/ssr/**", ...MUTATION],
        },
      },
      {
        plugins: [solid()],
        resolve: { alias, conditions },
        define: { ...define, __DEV__: "false" },
        test: { ...shared, name: "prod", include: ["tests/prod/**/*.test.tsx"] },
      },
      {
        plugins: [
          serverFlavour(),
          solid({
            ssr: true,
            hot: false,
            include: [/\.server\.tsx$/, /\?solid-server/],
            solid: { generate: "ssr", hydratable: true },
          }),
          // `hot: false` on both: solid-refresh wraps a component in an extra memo, which
          // shifts the hydration keys on one side only.
          solid({ ssr: true, hot: false, exclude: [/\.server\.tsx$/, /\?solid-server/] }),
        ],
        resolve: { alias, conditions },
        define,
        test: {
          ...shared,
          name: "ssr",
          include: ["tests/ssr/**/*.test.tsx"],
          // Solid's server build goes through the pipeline, or the redirect above resolves to
          // a file nothing transforms.
          server: { deps: { inline: [/solid-js/] } },
        },
      },
    ],
  },
});
