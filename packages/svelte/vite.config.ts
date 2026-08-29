// NOTE: This config is ONLY used by the `dev` script (`vite build --watch`).
// Publishing is handled by `svelte-package` (the `build` script), which does
// not read this file at all. Do not add UMD/CDN output or library-bundle
// options here — they have no effect on the published package.

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";
import { COMVI_CORE_EXTERNALS, createLibraryBuildOptions } from "@comvi/vite-config";

// EVERY `@comvi/core` entry the wrapper names must be external, along with all
// svelte subpaths: a missed core subpath is INLINED into the bundle, which is
// the duplicate-graph bug `@comvi/vue` hit.
const svelteExternal = (id: string) =>
  COMVI_CORE_EXTERNALS.includes(id) || id === "svelte" || id.startsWith("svelte/");

const baseBuild = createLibraryBuildOptions({
  entry: resolve(__dirname, "src/index.ts"),
  // Required by the interface; irrelevant with no UMD output.
  name: "ComviSvelte",
  fileNames: { es: "comvi-svelte.js", cjs: "comvi-svelte.cjs" },
  external: COMVI_CORE_EXTERNALS,
});

export default defineConfig({
  plugins: [svelte()],
  build: {
    ...baseBuild,
    rolldownOptions: {
      ...baseBuild.rolldownOptions,
      external: svelteExternal,
    },
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
