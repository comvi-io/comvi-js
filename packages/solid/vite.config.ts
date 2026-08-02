import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";

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
    external: [
      "solid-js",
      "solid-js/web",
      "solid-js/store",
      "@comvi/core",
      "@comvi/core/slim",
      "@comvi/core/tags",
    ],
    globals: {
      "solid-js": "SolidJS",
      "solid-js/web": "SolidJSWeb",
      "solid-js/store": "SolidJSStore",
      "@comvi/core": "ComviCore",
      "@comvi/core/slim": "ComviCoreSlim",
    },
    chunkFileNames: "chunks/comvi-solid-[name].js",
    // `<T>` — and with it this package's only `@comvi/core/tags` import — is
    // pinned into its own chunk so an app that never renders <T> drops the
    // whole module. In the previous single-file dist the top-level
    // `import "@comvi/core/tags"` sat in the SAME module as `useI18n`, and
    // core's `sideEffects` array forbids dropping the tags chunk, so every
    // solid app shipped the tag machinery (P0 finding 3 / fs-p1 blocker B1).
    // `@comvi/solid` declares `sideEffects: false`, so with T in its own
    // module the entry's re-export is a pure named binding a bundler may
    // prune. Public API is unchanged: `import { T } from "@comvi/solid"`.
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
