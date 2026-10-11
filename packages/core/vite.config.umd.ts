/**
 * Vite config for the minified CDN/UMD global build.
 * Produces dist/comvi-core.global.prod.js — the artifact pointed to by
 * the "unpkg" and "jsdelivr" fields in package.json.
 *
 * The entry is `src/umd.ts`, NOT the ESM root: since the single-entry
 * convergence the root is the bare base host, while a `<script src>` consumer
 * has no import graph to extend, so the global keeps its batteries-included
 * composition in a source file of its own (plan §2.5).
 *
 * mangle.toplevel:true is safe here because UMD/IIFE is a closed scope —
 * the ed4cc12 Nuxt rebundle bug was ESM-specific (top-level names leaked
 * into the consumer's bundler scope; that cannot happen in a UMD wrapper).
 */
import { defineConfig } from "vite";
import { resolve } from "path";
import pkg from "./package.json";
import { coreTreeshake, keepRegisterSideEffect, mangleInternalProps } from "./vite.shared";

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
  plugins: [keepRegisterSideEffect, mangleInternalProps()],
  build: {
    emptyOutDir: false, // main build already cleared dist/
    lib: {
      entry: resolve(__dirname, "src/umd.ts"),
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
      treeshake: coreTreeshake,
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
