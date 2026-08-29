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
    name: "ComviFetchLoader",
    // The lowercase installer reaches two capability subpaths; every
    // `@comvi/core` specifier stays external so the host's code is never
    // duplicated into this bundle.
    external: ["@comvi/core", "@comvi/core/loader", "@comvi/core/plugins"],
  }),
});
