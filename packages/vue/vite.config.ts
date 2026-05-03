import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: createLibraryBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviVue",
    fileNames: { es: "comvi-vue.js", cjs: "comvi-vue.cjs" },
    external: ["vue", "@comvi/core"],
    globals: {
      vue: "Vue",
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
