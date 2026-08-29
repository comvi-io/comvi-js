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
    chunkFileNames: "chunks/comvi-vue-[name].js",
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
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
});
