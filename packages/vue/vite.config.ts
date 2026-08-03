import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: createLibraryBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviVue",
    fileNames: { es: "comvi-vue.js", cjs: "comvi-vue.cjs" },
    // Every `@comvi/core` specifier MUST be external: with only the bare one
    // listed, rolldown INLINED verbatim copies of core's tags + translate
    // chunks into `comvi-vue.js` (fs-p1 blocker B3), so every vue app shipped
    // a duplicate tag graph that could not dedupe with its own @comvi/core —
    // and ran core's ambient `registerTagSyntax()` from inside the vue bundle.
    external: ["vue", ...COMVI_CORE_EXTERNALS],
    globals: {
      vue: "Vue",
      "@comvi/core": "ComviCore",
      "@comvi/core/slim": "ComviCoreSlim",
    },
    chunkFileNames: "chunks/comvi-vue-[name].js",
    // `<T>` — and with it this package's only `@comvi/core/tags` import — is
    // pinned into its own chunk so an app that never renders <T> drops the
    // whole module. In a single-file dist the top-level `import` of the tags
    // entry sits in the SAME module as `useI18n`, and core's `sideEffects`
    // array forbids dropping the tags chunk, so every vue app would ship the
    // tag machinery. `@comvi/vue` declares `sideEffects: false`, so with T in
    // its own module the entry's re-export is a pure named binding a bundler
    // may prune. Public API is unchanged: `import { T } from "@comvi/vue"`.
    // `keys` rides along: with `includeDependenciesRecursively: false` the T
    // chunk's import of `I18N_INJECTION_KEY` would otherwise resolve back into
    // the ENTRY chunk, and that cycle is enough to stop webpack's development
    // build from dropping T (and its /tags import) as unused.
    pinnedChunks: [
      { name: "T", test: /src[\\/]components[\\/]T\.ts/ },
      { name: "keys", test: /src[\\/]keys\.ts/ },
    ],
  }),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
});
