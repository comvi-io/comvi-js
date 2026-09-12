/**
 * Development ESM build (dist/comvi-react.dev.js) — selected by bundlers via
 * the "development" export condition. `__DEV__` is hardcoded true so the
 * `IS_DEV`-guarded diagnostics (`<T raw>` deprecation, the ssrInitialLocale /
 * ssrLocale clash) actually fire; the default artifact keeps them dropped.
 *
 * No `dts` plugin: the declarations are shared by both artifacts, so the prod
 * build is their single producer (the `types` condition names them once).
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { addUseClient, reactBuild } from "./vite.shared";

export default defineConfig({
  plugins: [react(), addUseClient],
  build: reactBuild(__dirname, ".dev"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
});
