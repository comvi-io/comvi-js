import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path, { resolve } from "node:path";
import dts from "vite-plugin-dts";

// Don't clean in watch mode to avoid race conditions with consuming apps
const isWatch = process.argv.includes("--watch");

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Skip type generation in watch mode for faster builds
    !isWatch &&
      dts({
        insertTypesEntry: true,
        tsconfigPath: "./tsconfig.app.json",
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    emptyOutDir: !isWatch,
    minify: !isWatch,
    sourcemap: isWatch ? "inline" : false,
    lib: {
      entry: {
        index: resolve(__dirname, "./src/entry-development.ts"),
        production: resolve(__dirname, "./src/entry-production.ts"),
      },
      name: "inContextEditor",
      formats: ["es", "cjs"],
      fileName: (format, entryName) => `${entryName}.${format === "es" ? "es" : "cjs"}.js`,
    },
    rolldownOptions: {
      external: ["@comvi/core"],
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
    },
  },
});
