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
    // Two entries, two module graphs: the root is the CDN path alone, so a
    // CDN-only app never bundles the API request path `./api` branches into at
    // runtime. `[name].js` keeps each one at the file its exports-map key names.
    entry: {
      index: resolve(__dirname, "src/index.ts"),
      api: resolve(__dirname, "src/api.ts"),
    },
    name: "ComviFetchLoader",
    fileNames: { es: "[name].js" },
    // Every `@comvi/core` specifier stays external so the host's code is
    // never duplicated into this bundle.
    external: ["@comvi/core", "@comvi/core/loader", "@comvi/core/plugins"],
  }),
});
