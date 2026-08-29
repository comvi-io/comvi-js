import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    solid(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: createLibraryBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviSolid",
    fileNames: { es: "comvi-solid.js", cjs: "comvi-solid.cjs" },
    external: ["solid-js", "solid-js/web", "solid-js/store", ...COMVI_CORE_EXTERNALS],
    globals: {
      "solid-js": "SolidJS",
      "solid-js/web": "SolidJSWeb",
      "solid-js/store": "SolidJSStore",
      "@comvi/core": "ComviCore",
    },
    chunkFileNames: "chunks/comvi-solid-[name].js",
    // `<T>` — and with it this package's only `@comvi/core/rich-text` import —
    // is pinned into its own chunk so an app that never renders <T> drops the
    // whole module. In the previous single-file dist the top-level rich-text
    // import sat in the SAME module as `useI18n`, and while it still named the
    // side-effectful `@comvi/core/tags` entry, core's `sideEffects` array
    // forbade dropping the tags chunk — so every solid app shipped the tag
    // machinery (P0 finding 3 / fs-p1 blocker B1). The seam is pure now, but
    // the chunk split is still what keeps the `<T>` pipeline out of an app
    // that does not render it.
    // This is now the package's only build pass and therefore its only chunk
    // graph/solid context. `sideEffects: false` lets a bundler prune the pure
    // named `T` re-export when unused.
    pinnedChunks: [{ name: "T", test: /src[\\/]T\.tsx/ }],
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
