import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { solidBuild } from "./vite.shared";

export default defineConfig({
  plugins: [
    solid(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: solidBuild(__dirname, ""),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    // The published comvi-solid.js is always the PROD artifact — `vite build`
    // pins NODE_ENV=production, so reading it here only ever produced `false`.
    // The dev-only diagnostics ship in comvi-solid.dev.js
    // (vite.config.dev.ts), reachable via the "development" export condition.
    __DEV__: JSON.stringify(false),
  },
});
