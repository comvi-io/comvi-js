import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions } from "@comvi/vite-config";
import pkg from "./package.json";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    ...createLibraryBuildOptions({
      entry: resolve(__dirname, "src/index.ts"),
      name: "ComviCore",
      fileNames: { es: "comvi-core.js", cjs: "comvi-core.cjs" },
    }),
    // Skips Rolldown's bundle-level compress pass (only runs for "esbuild");
    // per-output oxcMinifyOptions handles minification. Terser is never invoked.
    minify: "terser",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    __VERSION__: JSON.stringify(pkg.version),
  },
});
