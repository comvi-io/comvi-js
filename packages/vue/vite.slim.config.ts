import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

// Second build pass for the star-free `@comvi/vue/slim` entry (P4-AB1).
// Separate invocation, not a second `lib.entry`: the two entries must not share
// a chunk graph, or the slim entry would import a chunk the main entry also
// pins — and with it `index.ts`'s `export * from "@comvi/core"`, the star
// re-export P4-AB1 exists to keep out of this graph. Not a claim that
// `@comvi/core` stays out: `src/slim.ts` re-exports the base root's
// constructor as `createCore` by design.
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
      external: ["vue", ...COMVI_CORE_EXTERNALS],
      globals: {
        vue: "Vue",
        "@comvi/core": "ComviCore",
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
