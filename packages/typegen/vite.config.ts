import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createPluginBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: createPluginBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviTypegen",
    // `augmentationTargetError` reads the app's node_modules; the built
    // declaration emitter stays free of Node built-ins. Both consumers inline
    // this bundle, and both already externalize these.
    external: ["node:fs", "node:path"],
  }),
});
