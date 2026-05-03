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
    name: "ComviLocaleDetector",
    external: ["@comvi/core"],
  }),
});
