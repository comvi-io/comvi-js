import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";

// Externalize all svelte subpaths (svelte/internal/client, svelte/store, etc.)
const svelteExternal = (id: string) =>
  id === "@comvi/core" || id === "svelte" || id.startsWith("svelte/");

const baseBuild = createLibraryBuildOptions({
  entry: resolve(__dirname, "src/index.ts"),
  name: "ComviSvelte",
  fileNames: { es: "comvi-svelte.js", cjs: "comvi-svelte.cjs" },
  external: ["@comvi/core"],
  globals: {
    "@comvi/core": "ComviCore",
  },
});

export default defineConfig({
  plugins: [
    svelte(),
    dts({
      insertTypesEntry: true,
    }),
  ],
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
