// NOTE: This config is ONLY used by the `dev` script (`vite build --watch`).
// Publishing is handled by `svelte-package` (the `build` script), which does
// not read this file at all. Do not add UMD/CDN output or library-bundle
// options here — they have no effect on the published package.

import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";

// Externalize every @comvi/core entry (root + the /slim and /tags subpaths the
// wrapper now imports) and all svelte subpaths (svelte/internal/client, etc.).
// A missed core subpath would be INLINED into the bundle — the duplicate-graph
// bug fs-p1 recorded as blocker B3 for @comvi/vue.
const svelteExternal = (id: string) =>
  id === "@comvi/core" ||
  id === "@comvi/core/slim" ||
  id === "@comvi/core/tags" ||
  id === "svelte" ||
  id.startsWith("svelte/");

const baseBuild = createLibraryBuildOptions({
  entry: resolve(__dirname, "src/index.ts"),
  // name is required by the interface but irrelevant here (no UMD output)
  name: "ComviSvelte",
  fileNames: { es: "comvi-svelte.js", cjs: "comvi-svelte.cjs" },
  external: ["@comvi/core", "@comvi/core/slim", "@comvi/core/tags"],
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
