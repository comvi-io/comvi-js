import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
    // Add "use client" directive for Next.js App Router compatibility
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
  build: createLibraryBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviReact",
    fileNames: { es: "comvi-react.js", cjs: "comvi-react.cjs" },
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
    chunkFileNames: "chunks/comvi-react-[name].js",
    // `<T>` — and with it this package's only `@comvi/core/rich-text` import —
    // is pinned into its own chunk so an app that never renders <T> drops the
    // whole module. In the previous single-file dist the top-level rich-text
    // import sat in the SAME module as `useI18n`, and while it still named the
    // side-effectful `@comvi/core/tags` entry, core's `sideEffects` array
    // forbade dropping the tags chunk — so every react app shipped the tag
    // machinery (P0 finding 3 / fs-p1 blocker B1). The seam is pure now, but
    // the chunk split is still what keeps the `<T>` pipeline out of an app
    // that does not render it.
    // This is now the package's only build pass and therefore its only chunk
    // graph/React context. `sideEffects: false` lets a bundler prune the pure
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
