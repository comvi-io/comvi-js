/**
 * Vite config for the minified CDN/UMD global build.
 * Produces dist/comvi-core.global.prod.js — the artifact pointed to by
 * the "unpkg" and "jsdelivr" fields in package.json.
 *
 * mangle.toplevel:true is safe here because UMD/IIFE is a closed scope —
 * the ed4cc12 Nuxt rebundle bug was ESM-specific (top-level names leaked
 * into the consumer's bundler scope; that cannot happen in a UMD wrapper).
 */
import { defineConfig } from "vite";
import { resolve } from "path";
import { treeshakeOptions } from "@comvi/vite-config";
import pkg from "./package.json";

const umdMinifyOptions = {
  compress: {
    target: "es2020",
    dropConsole: true,
    dropDebugger: true,
    unused: true,
    joinVars: true,
    sequences: true,
    treeshake: {
      annotations: true,
      manualPureFunctions: ["console.log", "console.warn"],
      propertyReadSideEffects: false,
      unknownGlobalSideEffects: false,
    },
  },
  mangle: {
    toplevel: true,
    keepNames: false,
  },
  codegen: {
    removeWhitespace: true,
  },
};

export default defineConfig({
  build: {
    emptyOutDir: false, // main build already cleared dist/
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ComviCore",
    },
    minify: true,
    sourcemap: false,
    rolldownOptions: {
      external: [],
      output: [
        {
          format: "umd",
          entryFileNames: "comvi-core.global.prod.js",
          name: "ComviCore",
          // @ts-expect-error rolldown oxc minify option — not yet in TS types
          minify: umdMinifyOptions,
        },
      ],
      treeshake: treeshakeOptions,
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    // Hardcode false so __DEV__ branches are DCE'd in the CDN bundle
    __DEV__: JSON.stringify(false),
    __VERSION__: JSON.stringify(pkg.version),
  },
});
