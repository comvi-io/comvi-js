/**
 * Development ESM build (dist/comvi-core.dev.js) — selected by bundlers via
 * the "development" export condition. __DEV__ is hardcoded true so error
 * messages stay readable in dev; the prod file keeps E_* codes.
 */
import { defineConfig } from "vite";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";
import pkg from "./package.json";

export default defineConfig({
  build: {
    ...createLibraryBuildOptions({
      entry: resolve(__dirname, "src/index.ts"),
      name: "ComviCore",
      fileNames: { es: "comvi-core.dev.js", cjs: "comvi-core.dev.cjs" },
    }),
    emptyOutDir: false, // main build already cleared dist/
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
    __VERSION__: JSON.stringify(pkg.version),
  },
});
