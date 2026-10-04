/**
 * Shared pieces of the @comvi/next build (prod / dev), mirroring
 * `packages/core/vite.shared.ts` and the three binding wrappers.
 *
 * TWO artifact families ship from one source tree. With
 * `preserveModules: true` that means one file per source module, twice:
 * - `dist/<module>.js`     — `__DEV__: false`, what `default` resolves to;
 * - `dist/<module>.dev.js` — `__DEV__: true`, what a bundler picks under the
 *   `"development"` export condition (`vite.config.dev.ts`). Every runtime
 *   entry in the exports map names both.
 *
 * WHY: `vite build` pins `NODE_ENV=production`, so a package with a single
 * artifact family bakes `__DEV__: false` into the only files consumers can
 * resolve — the readable `E_USE_HOST_IDENTITY` message in
 * `src/createNextI18n.ts` was then dead code in the published package, no
 * matter what mode the consuming app built in.
 *
 * `@comvi/next` deliberately does not use `createLibraryBuildOptions`: it is
 * the one package that publishes preserved MODULES rather than bundled
 * entries, because `"use client"` is a per-file directive.
 */
import { resolve } from "path";
import type { Plugin } from "vite";

const isWatchMode = process.argv.includes("--watch");

/**
 * Files that need the "use client" directive, as emitted-name suffixes.
 *
 * `routing.js` and `routing/defineRouting.js` are deliberately absent:
 * `defineRouting` runs in middleware (server-side). The navigation components
 * live in `navigation.js`.
 */
const CLIENT_MODULES = [
  "client",
  "client/I18nProvider",
  // Rendered by the server `ComviProvider`: a relative import from
  // `server/ComviProvider.js`, which Next turns into a client reference.
  "client/ComviClientProvider",
  "navigation",
  "routing/Link",
  "routing/hooks",
];

/**
 * Adds "use client" to the client-runtime files of ONE artifact family.
 * `suffix` has to be threaded through: the dev family's emitted names are
 * `client.dev.js`, `routing/Link.dev.js`, … so a list of `*.js` names would
 * silently match nothing and ship a dev artifact with no directive at all.
 */
export const addUseClient = (suffix: "" | ".dev"): Plugin => {
  const clientFiles = CLIENT_MODULES.map((name) => `${name}${suffix}.js`);
  return {
    name: "add-use-client",
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk" && clientFiles.some((f) => fileName.endsWith(f))) {
          chunk.code = `"use client";\n${chunk.code}`;
        }
      }
    },
  };
};

/** Build options for one artifact family; `suffix` is "" (prod) or ".dev". */
export const nextBuild = (dir: string, suffix: "" | ".dev") => ({
  // The prod build (run first) is the one that clears dist/; the dev build
  // adds files to it and must not wipe them.
  emptyOutDir: suffix === "" && !isWatchMode,
  lib: {
    entry: {
      index: resolve(dir, "src/index.ts"),
      server: resolve(dir, "src/server.ts"),
      client: resolve(dir, "src/client.ts"),
      middleware: resolve(dir, "src/middleware.ts"),
      routing: resolve(dir, "src/routing.ts"),
      navigation: resolve(dir, "src/navigation.ts"),
      // Node only: next.config imports it, no bundle ever does.
      plugin: resolve(dir, "src/plugin.ts"),
      // The stub `@comvi/next/config` resolves to without `withComvi`.
      config: resolve(dir, "src/config.ts"),
    },
    formats: ["es" as const],
  },
  minify: false, // Disable minification to preserve "use client"
  rolldownOptions: {
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "next",
      "next/server",
      "next/headers",
      "next/navigation",
      "next/link",
      // The bare side-effect import at the top of `src/server.ts`. External so
      // the emitted `dist/server.js` keeps it verbatim for the APP's bundler to
      // resolve per condition; inlined, it would be either a throw or nothing.
      "server-only",
      // The package's own config specifier stays a bare import, so the APP's
      // bundler resolves it — to the user module under `withComvi`'s alias,
      // to `dist/config.js` without it. Inlined, the alias could never apply.
      "@comvi/next/config",
      // `dist/plugin.js` runs in Node, from next.config.
      "node:fs",
      "node:module",
      "node:path",
      // Every `@comvi/core` specifier this package names must be external,
      // or rolldown inlines a verbatim copy of core into `dist`. Kept in sync
      // by hand: `@comvi/next` does not use `createLibraryBuildOptions`, so it
      // cannot spread `COMVI_CORE_EXTERNALS` from `@comvi/vite-config`.
      "@comvi/core",
      "@comvi/core/icu",
      "@comvi/core/loader",
      "@comvi/core/plugins",
      "@comvi/core/devtools",
      // The composed builder registers ambient tag syntax by importing this
      // side-effectful subpath (the 0.4 root did it for us); leaving it
      // non-external inlines core's whole tag graph into `dist`. Its pure
      // half rides along for the same reason: `@comvi/react`'s `<T>` is what
      // names it, and a private inlined copy could not dedupe with the app's.
      "@comvi/core/rich-text",
      "@comvi/core/tags",
      // `@comvi/locale-routing` is deliberately ABSENT: it is a workspace-private
      // package, so rolldown must INLINE it. `preserveModules` keeps it a single
      // emitted module shared by the entries that import it (routing, middleware,
      // navigation, root), not a copy per entry.
      "@comvi/react",
      "@comvi/plugin-fetch-loader",
    ],
    output: {
      globals: {
        react: "React",
        "react-dom": "ReactDOM",
        "react/jsx-runtime": "jsxRuntime",
        next: "Next",
        "@comvi/core": "ComviCore",
        "@comvi/react": "ComviReact",
      },
      preserveModules: true,
      preserveModulesRoot: "src",
      // With `preserveModules` both patterns are per-MODULE, and both have to
      // carry the suffix or the dev family would overwrite the prod one file
      // by file. `[name]` is the module path below `preserveModulesRoot`, so
      // the directory layout is unchanged.
      entryFileNames: `[name]${suffix}.js`,
      chunkFileNames: `[name]${suffix}.js`,
    },
  },
});
