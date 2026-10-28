import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createPluginBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  // The v2 reader runs @comvi/core's scanner with its development-only shape observer
  // (`__DEV__ && P.o`), so this bundle is built with `__DEV__` on.
  define: { __DEV__: JSON.stringify(true) },
  plugins: [
    dts({
      insertTypesEntry: true,
      // src/v2/read.ts imports @comvi/core's scanner source; declarations are for
      // this package's own files, rooted at src.
      entryRoot: "src",
      include: ["src"],
      compilerOptions: { rootDir: resolve(__dirname, "..") },
    }),
  ],
  build: createPluginBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviTypegen",
    // `augmentationTargetError` reads the app's node_modules; the built
    // declaration emitter stays free of Node built-ins. Both consumers inline
    // this bundle, and both already externalize these.
    external: ["node:crypto", "node:fs", "node:os", "node:path"],
  }),
});
