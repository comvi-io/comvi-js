import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

// Second build pass for the star-free `@comvi/react/slim` entry, following the
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
// it two distinct React contexts. `src/slim.ts` documents the consequence:
// pick one entry per app.
export default defineConfig({
  plugins: [
    react(),
    // Types come from the main pass's `dts` (it emits a .d.ts per source file,
    // `src/slim.ts` included). A second emit here would race it for the same
    // paths.
    {
      name: "add-use-client",
      generateBundle(_, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === "chunk") {
            chunk.code = `"use client";\n${chunk.code}`;
          }
        }
      },
    },
  ],
  build: {
    ...createLibraryBuildOptions({
      entry: resolve(__dirname, "src/slim.ts"),
      name: "ComviReactSlim",
      fileNames: { es: "comvi-react-slim.js" },
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        ...COMVI_CORE_EXTERNALS,
        "use-sync-external-store",
        "use-sync-external-store/shim",
      ],
      globals: {
        react: "React",
        "react-dom": "ReactDOM",
        "react/jsx-runtime": "jsxRuntime",
        "@comvi/core": "ComviCore",
      },
      chunkFileNames: "chunks/comvi-react-slim-[name].js",
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
