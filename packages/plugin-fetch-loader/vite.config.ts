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
    // Two entries, two module graphs: `./cdn` exists so a CDN-only app never
    // bundles the API request path the root entry branches into at runtime.
    // `[name].js` keeps each one at the file its exports-map key names.
    entry: {
      index: resolve(__dirname, "src/index.ts"),
      cdn: resolve(__dirname, "src/cdn/index.ts"),
    },
    name: "ComviFetchLoader",
    fileNames: { es: "[name].js" },
    // Every `@comvi/core` specifier stays external so the host's code is
    // never duplicated into this bundle.
    external: ["@comvi/core", "@comvi/core/loader", "@comvi/core/plugins"],
  }),
});
