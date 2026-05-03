import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createLibraryBuildOptions, terserOptions } from "@comvi/vite-config";
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
    minify: "terser",
    terserOptions: {
      ...terserOptions,
      compress: {
        ...terserOptions.compress,
        passes: 5,
        module: true,
        toplevel: true,
        hoist_props: true,
        pure_getters: true,
        reduce_funcs: true,
        reduce_vars: true,
        collapse_vars: true,
        sequences: 200,
      },
      mangle: {
        ...terserOptions.mangle,
        toplevel: true,
        properties: {
          regex: /^_/,
        },
        keep_fnames: false,
      },
      format: {
        ...terserOptions.format,
        wrap_func_args: false,
      },
    },
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
