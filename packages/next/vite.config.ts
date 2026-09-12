import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { addUseClient, nextBuild } from "./vite.shared";

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      rollupTypes: false,
    }),
    addUseClient(""),
  ],
  build: nextBuild(__dirname, ""),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    // The published dist/*.js are always the PROD artifacts — `vite build`
    // pins NODE_ENV=production, so reading it here only ever produced `false`.
    // The dev-only diagnostics ship in the dist/*.dev.js family
    // (vite.config.dev.ts), reachable via the "development" export condition.
    __DEV__: JSON.stringify(false),
  },
});
