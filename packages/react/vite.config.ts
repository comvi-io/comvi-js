import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { addUseClient, reactBuild } from "./vite.shared";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
    addUseClient,
  ],
  build: reactBuild(__dirname, ""),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    // The published comvi-react.js is always the PROD artifact — `vite build`
    // pins NODE_ENV=production, so reading it here only ever produced `false`.
    // The dev-only diagnostics ship in comvi-react.dev.js
    // (vite.config.dev.ts), reachable via the "development" export condition.
    __DEV__: JSON.stringify(false),
  },
});
