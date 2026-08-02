import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";

// Second build pass for the root-free `@comvi/vue/slim` entry (P4-AB1).
// Separate invocation, not a second `lib.entry`: the two entries must not share
// a chunk graph, or the slim entry would import a chunk the root entry also
// pins and the whole point would be lost.
export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: false,
      include: ["src/**/*.ts"],
    }),
  ],
  build: {
    ...createLibraryBuildOptions({
      entry: resolve(__dirname, "src/slim.ts"),
      name: "ComviVueSlim",
      fileNames: { es: "comvi-vue-slim.js" },
      external: ["vue", "@comvi/core", "@comvi/core/slim", "@comvi/core/tags"],
      globals: {
        vue: "Vue",
        "@comvi/core/slim": "ComviCoreSlim",
      },
      chunkFileNames: "chunks/comvi-vue-slim-[name].js",
      pinnedChunks: [
        { name: "T", test: /src[\\/]components[\\/]T\.ts/ },
        { name: "keys", test: /src[\\/]keys\.ts/ },
      ],
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
