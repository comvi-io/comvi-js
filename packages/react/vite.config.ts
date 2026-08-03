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
      "@comvi/core/slim": "ComviCoreSlim",
    },
    chunkFileNames: "chunks/comvi-react-[name].js",
    // `<T>` — and with it this package's only `@comvi/core/tags` import — is
    // pinned into its own chunk so an app that never renders <T> drops the
    // whole module. In the previous single-file dist the top-level
    // `import "@comvi/core/tags"` sat in the SAME module as `useI18n`, and
    // core's `sideEffects` array forbids dropping the tags chunk, so every
    // react app shipped the tag machinery (P0 finding 3 / fs-p1 blocker B1).
    // `@comvi/react` declares `sideEffects: false`, so with T in its own
    // module the entry's re-export is a pure named binding a bundler may
    // prune. Public API is unchanged: `import { T } from "@comvi/react"`.
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
