/**
 * Development ESM build (dist/comvi-vue.dev.js) — selected by bundlers via the
 * "development" export condition. `__DEV__` is hardcoded true so the
 * `IS_DEV`-guarded diagnostics (the `<T raw>` deprecation, the late-compose
 * warning in `VueI18n`) actually fire; the default artifact keeps them
 * dropped.
 *
 * No `dts` plugin: the declarations are shared by both artifacts, so the prod
 * build is their single producer (the `types` condition names them once).
 */
import { defineConfig } from "vite";
import { resolve } from "path";
import { vueBuild } from "./vite.shared";

export default defineConfig({
  build: vueBuild(__dirname, ".dev"),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
  },
});
