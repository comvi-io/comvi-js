/** Shared pieces of the @comvi/react build, mirroring `packages/core/vite.shared.ts`. */
import { resolve } from "path";
import type { Plugin } from "vite";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

/** "use client" for Next.js App Router compatibility. */
export const addUseClient: Plugin = {
  name: "add-use-client",
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === "chunk") {
        chunk.code = `"use client";\n${chunk.code}`;
      }
    }
  },
};

/** Build options for the package's one artifact. */
export const reactBuild = (dir: string) => ({
  ...createLibraryBuildOptions({
    entry: resolve(dir, "src/index.ts"),
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
});
