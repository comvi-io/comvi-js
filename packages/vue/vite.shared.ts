/**
 * Shared pieces of the @comvi/vue build (prod / dev), mirroring
 * `packages/core/vite.shared.ts`.
 *
 * TWO artifacts ship from one source tree:
 * - `dist/comvi-vue.js`     — `__DEV__: false`, what `default` resolves to;
 * - `dist/comvi-vue.dev.js` — `__DEV__: true`, what a bundler picks under the
 *   `"development"` export condition (`vite.config.dev.ts`).
 *
 * WHY: `vite build` pins `NODE_ENV=production`, so a package with a single
 * artifact bakes `__DEV__: false` into the only file consumers can resolve —
 * every `IS_DEV`-guarded diagnostic in `src/` is then dead code in the
 * published package, no matter what mode the consuming app builds in. The
 * `.dev` artifact is the only thing that makes those warnings reachable, and
 * it is reachable ONLY because package.json answers the `development`
 * condition with it.
 */
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

/** Build options for one artifact; `suffix` is "" (prod) or ".dev". */
export const vueBuild = (dir: string, suffix: "" | ".dev") => ({
  ...createLibraryBuildOptions({
    entry: resolve(dir, "src/index.ts"),
    name: "ComviVue",
    fileNames: { es: `comvi-vue${suffix}.js`, cjs: `comvi-vue${suffix}.cjs` },
    // EVERY `@comvi/core` specifier must be external. With only the bare one
    // listed, rolldown inlined verbatim copies of core's tags and translate
    // chunks here, so every vue app shipped a duplicate tag graph that could
    // not dedupe with its own `@comvi/core` — and ran core's ambient
    // `registerTagSyntax()` from inside the vue bundle.
    external: ["vue", ...COMVI_CORE_EXTERNALS],
    globals: {
      vue: "Vue",
      "@comvi/core": "ComviCore",
    },
    chunkFileNames: `chunks/comvi-vue-[name]${suffix}.js`,
    // `<T>` — and with it this package's only `@comvi/core/rich-text` import —
    // is pinned into its own chunk, so an app that never renders `<T>` drops
    // the whole module. Sharing a module with `useI18n` once put the rich-text
    // pipeline into every vue app.
    //
    // `keys` rides along: with `includeDependenciesRecursively: false` the T
    // chunk's import of `I18N_INJECTION_KEY` would resolve back into the ENTRY
    // chunk, and that cycle alone stops webpack's development build from
    // dropping T (and its rich-text import) as unused.
    pinnedChunks: [
      { name: "T", test: /src[\\/]components[\\/]T\.ts/ },
      { name: "keys", test: /src[\\/]keys\.ts/ },
    ],
  }),
  // The prod build (run first) is the one that clears dist/; the dev build
  // adds files to it and must not wipe them.
  ...(suffix === "" ? {} : { emptyOutDir: false }),
});
