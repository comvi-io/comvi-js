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
 * resolve — the readable `E_USE_INSTANCE_IDENTITY` message in
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
      server: resolve(dir, "src/server.ts"),
      client: resolve(dir, "src/client.ts"),
      middleware: resolve(dir, "src/middleware.ts"),
      proxy: resolve(dir, "src/proxy.ts"),
      routing: resolve(dir, "src/routing.ts"),
      navigation: resolve(dir, "src/navigation.ts"),
      // Prod family only: neither has a "development" export condition, so a
      // `.dev.js` twin would ship unreachable.
      ...(suffix === ""
        ? {
            // Node only: next.config imports it, no bundle ever does.
            plugin: resolve(dir, "src/plugin.ts"),
          }
        : {}),
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
      "@comvi/core",
      "@comvi/core/internal",
      "@comvi/core/ssr",
      // `@comvi/locale-routing` is deliberately ABSENT: it is a workspace-private
      // package, so rolldown must INLINE it. `preserveModules` keeps it a single
      // emitted module shared by the entries that import it (routing, middleware,
      // navigation, root), not a copy per entry.
      "@comvi/react",
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
