import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    solid(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: createLibraryBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviSolid",
    fileNames: { es: "comvi-solid.js", cjs: "comvi-solid.cjs" },
    external: ["solid-js", "solid-js/web", "solid-js/store", "@comvi/core"],
    globals: {
      "solid-js": "SolidJS",
      "solid-js/web": "SolidJSWeb",
      "solid-js/store": "SolidJSStore",
      "@comvi/core": "ComviCore",
    },
  }),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
});
