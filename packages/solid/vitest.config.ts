import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { createRequire } from "node:module";
import { dirname, resolve } from "path";

// Resolve core's dist through node_modules, not a relative path: inside a Stryker
// sandbox (.stryker-tmp/sandbox-*) the package is copied, so "../core" does not
// exist — but the node_modules symlink chain still reaches the real workspace.
const CORE_DIST = dirname(createRequire(import.meta.url).resolve("@comvi/core"));

const SOLID_ROOT = dirname(createRequire(import.meta.url).resolve("solid-js/package.json"));

/**
 * The marker that makes a module SERVER-FLAVOURED in the `ssr` project below.
 *
 * A real hydration test needs the same source compiled twice in one process:
 * `generate: "ssr"` against solid's server build for `renderToString`, and
 * `generate: "dom"` against the browser build for `hydrate()`. Vitest gives a
 * project one module graph, so the two flavours are separated by this query
 * instead: `resolveId` below tags every relative import reached from a
 * `*.server.tsx` fixture with it, which both gives that subgraph its own
 * module instances and lets the ssr-generating `vite-plugin-solid` instance
 * select it by filter.
 */
const SERVER_FLAVOUR = "?solid-server";

/**
 * Bare specifiers are deliberately NOT tagged: `@comvi/core` stays ONE copy,
 * so the host the test builds is the host the server render and the hydrating
 * client both drive — exactly the object an app would serialize around.
 * `solid-js` and `solid-js/web` are the exception, redirected to the server
 * builds, since the flavour exists precisely to reach those.
 */
function solidServerFlavour() {
  /**
   * Solid's own server builds are on the list: `web/dist/server.js` imports
   * `solid-js`, and left to the project's browser conditions it would drive
   * the CLIENT reactive core — one `sharedConfig` for both halves, whose
   * hydration-key walk then counts the server tree and the client tree into
   * the same counter and every key disagrees.
   */
  const SERVER_IMPORTERS = [
    /\.server\.tsx$/,
    new RegExp(SERVER_FLAVOUR.replace("?", "\\?")),
    /solid-js\/web\/dist\/server\.js$/,
    /solid-js\/dist\/server\.js$/,
  ];
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
      if (!importer || !SERVER_IMPORTERS.some((pattern) => pattern.test(importer))) return null;
      if (source === "solid-js/web") return `${SOLID_ROOT}/web/dist/server.js`;
      if (source === "solid-js") return `${SOLID_ROOT}/dist/server.js`;
      // Virtual ids (`/@solid-refresh`) and bare packages are left alone.
      if (source.startsWith("/@") || !/^[./]/.test(source)) return null;
      const resolved = await this.resolve(source, importer.replace(SERVER_FLAVOUR, ""), {
        skipSelf: true,
      });
      return resolved ? `${resolved.id}${SERVER_FLAVOUR}` : null;
    },
  };
}

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
  plugins: [solid()],
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
    projects: [
      {
        ...shared,
        resolve: {
          alias: {
            "@": resolve(__dirname, "./src"),
          },
          conditions: ["development", "browser"],
        },
        test: {
          name: "unit",
          globals: true,
          restoreMocks: true,
          unstubEnvs: true,
          unstubGlobals: true,
          environment: "happy-dom",
          include: ["tests/**/*.test.{ts,tsx}"],
          // `tests/ssr` needs the dual compilation the `ssr` project sets up.
          exclude: ["tests/ssr/**"],
        },
      },
      {
        // The SSR + hydration project: `*.server.tsx` fixtures and everything
        // they import are compiled `generate: "ssr"` against solid's server
        // build, the test file itself `generate: "dom"` against the browser
        // build, in one happy-dom process — so one test can render a tree to a
        // string and then hydrate that exact string.
        plugins: [
          solidServerFlavour(),
          solid({
            ssr: true,
            hot: false,
            include: [/\.server\.tsx$/, /\?solid-server/],
            solid: { generate: "ssr", hydratable: true },
          }),
          // `hot: false` on BOTH: solid-refresh wraps each component in an
          // extra memo, which shifts the hydration keys on one side only.
          solid({ ssr: true, hot: false, exclude: [/\.server\.tsx$/, /\?solid-server/] }),
        ],
        define: { __DEV__: JSON.stringify(true) },
        resolve: {
          alias: { "@": resolve(__dirname, "./src") },
          conditions: ["development", "browser"],
        },
        test: {
          name: "ssr",
          globals: true,
          restoreMocks: true,
          unstubEnvs: true,
          unstubGlobals: true,
          environment: "happy-dom",
          include: ["tests/ssr/**/*.test.tsx"],
          // Solid's server build must go through the plugin pipeline, or the
          // flavour redirect above resolves to a file nothing transforms.
          server: { deps: { inline: [/solid-js/] } },
        },
      },
      {
        ...shared,
        resolve: { alias: coreBuild(".dev"), conditions: ["browser"] },
        define: { ...shared.define, __COMVI_CORE_BUILD__: JSON.stringify("development") },
        test: { ...jsContract, name: "js-contract-dev" },
      },
      {
        ...shared,
        resolve: { alias: coreBuild(""), conditions: ["browser"] },
        define: {
          __DEV__: JSON.stringify(false),
          __COMVI_CORE_BUILD__: JSON.stringify("production"),
        },
        test: { ...jsContract, name: "js-contract-prod" },
      },
    ],
  },
});
