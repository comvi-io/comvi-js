/**
 * Vite config for standalone IIFE build
 * This builds the plugin for CDN loading by Chrome extension
 *
 * Output: dist/standalone.iife.js
 */
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path, { resolve } from "node:path";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    emptyOutDir: false, // Don't clear dist, we're adding to it
    minify: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "./src/standalone.ts"),
      name: "ComviInContextEditor",
      fileName: () => "standalone.iife.js",
      formats: ["iife"],
    },
    rolldownOptions: {
      // Bundle EVERYTHING - no external dependencies
      // The standalone build must work without @comvi/core being importable
      // (it accesses window.__COMVI__ instead)
      external: [],
      output: {
        // Inline all CSS into JS
        assetFileNames: "standalone.[ext]",
      },
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
    },
  },
  define: {
    // Mark as production
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
