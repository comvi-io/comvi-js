import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

// Second build pass for the star-free `@comvi/solid/slim` entry, following the
// `@comvi/vue/slim` precedent (fs-p4 §2). Separate invocation, not a second
// `lib.entry`: the two entries must not share a chunk graph, or the slim entry
// would import a chunk the main entry also pins, and the point — a dist entry
// whose graph is exactly what `src/slim.ts` names, in EVERY bundler and mode
// rather than only where tree-shaking is on — would be lost.
//
// What that is NOT: a promise that `@comvi/core` stays out. `src/slim.ts`
// re-exports the base root's `createI18n` by name, so the base host module is
// reachable from this entry by design. What the separate pass keeps out is the
// main entry's extra root surface (its `I18n` class re-export) and, for an app
// that never renders `<T>`, the side-effectful `@comvi/core/tags` chunk.
//
// The cost is a duplicated binding graph across the two dist entries, and with
// it two distinct solid contexts. `src/slim.ts` documents the consequence:
// pick one entry per app.
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
        "@comvi/core": "ComviCore",
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
