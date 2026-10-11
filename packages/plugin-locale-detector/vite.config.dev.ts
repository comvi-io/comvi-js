/**
 * Development ESM build (dist/index.dev.js), selected by bundlers through the
 * "development" export condition. `__DEV__` is hardcoded true so the
 * `IS_DEV`-guarded warning about a missing `supportedLocales` fires; the
 * default artifact keeps it dropped.
 *
 * No `dts` plugin: the declarations are shared by both artifacts, so the prod
 * build is their single producer.
 */
import { defineConfig } from "vite";
import { resolve } from "path";
import { createPluginBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  build: {
    ...createPluginBuildOptions({
      entry: resolve(__dirname, "src/index.ts"),
      name: "ComviLocaleDetector",
      fileNames: { es: "index.dev.js" },
      external: ["@comvi/core", "@comvi/core/plugins"],
    }),
    // The prod build (run first) is the one that clears dist/; this one adds a
    // file to it and must not wipe the rest.
    emptyOutDir: false,
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
});
