/**
 * Development ESM build (dist/comvi-vue*.dev.js), selected by bundlers through the
 * "development" export condition: `__DEV__` is true, so a composable outside an app that
 * installed the instance throws a readable error.
 */
import { defineConfig } from "vite";
import { entries, external, output } from "./vite.entries.ts";

export default defineConfig({
  build: {
    emptyOutDir: false, // the production build already cleared dist/
    lib: { entry: entries(import.meta.dirname), name: "ComviVue" },
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      external,
      preserveEntrySignatures: "allow-extension",
      output: [output(".dev")],
      treeshake: { moduleSideEffects: false },
    },
  },
  define: { __DEV__: JSON.stringify(true) },
});
