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
    // is pinned into its own chunk, so an app that never renders `<T>` drops
    // the whole module. Sharing a module with `useI18n` once put the rich-text
    // pipeline into every solid app.
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
