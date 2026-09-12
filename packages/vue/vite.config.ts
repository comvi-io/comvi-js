import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { vueBuild } from "./vite.shared";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: vueBuild(__dirname, ""),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    // The published comvi-vue.js is always the PROD artifact — `vite build`
    // pins NODE_ENV=production, so reading it here only ever produced `false`.
    // The dev-only diagnostics ship in comvi-vue.dev.js (vite.config.dev.ts),
    // reachable via the "development" export condition.
    __DEV__: JSON.stringify(false),
  },
});
