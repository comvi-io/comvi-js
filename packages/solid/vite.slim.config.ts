import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

// Second build pass for the root-free `@comvi/solid/slim` entry, following the
// `@comvi/vue/slim` precedent (fs-p4 §2). Separate invocation, not a second
// `lib.entry`: the two entries must not share a chunk graph, or the slim entry
// would import a chunk the root entry also pins and the whole point — a graph
// in which the root `@comvi/core` entry is unreachable in EVERY bundler and
// mode, not merely prunable in most of them — would be lost.
//
// The cost of that guarantee is a duplicated binding graph across the two dist
// entries, and with it two distinct solid contexts. `src/slim.ts` documents the
// consequence: pick one entry per app.
export default defineConfig({
  // Types come from the main pass's `dts` (it emits a .d.ts per source file,
  // `src/slim.ts` included). A second emit here would race it for the same
  // paths.
  plugins: [solid()],
  build: {
    ...createLibraryBuildOptions({
      entry: resolve(__dirname, "src/slim.ts"),
      name: "ComviSolidSlim",
      fileNames: { es: "comvi-solid-slim.js" },
      external: ["solid-js", "solid-js/web", "solid-js/store", ...COMVI_CORE_EXTERNALS],
      globals: {
        "solid-js": "SolidJS",
        "solid-js/web": "SolidJSWeb",
        "solid-js/store": "SolidJSStore",
        "@comvi/core/slim": "ComviCoreSlim",
      },
      chunkFileNames: "chunks/comvi-solid-slim-[name].js",
      // Same reason as the main pass: `<T>` carries this package's only
      // `@comvi/core/tags` import, so it has to leave the entry module or
      // every slim app ships the tag machinery.
      pinnedChunks: [{ name: "T", test: /src[\\/]T\.tsx/ }],
    }),
    // The main build owns dist/; this pass only adds to it.
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
});
