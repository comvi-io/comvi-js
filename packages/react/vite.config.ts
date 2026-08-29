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
    // "use client" for Next.js App Router compatibility.
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
    // is pinned into its own chunk, so an app that never renders `<T>` drops
    // the whole module. Sharing a module with `useI18n` once put the rich-text
    // pipeline into every react app.
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
