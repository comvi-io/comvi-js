/**
 * Development ESM build (dist/comvi-solid*.dev.js), selected by bundlers through the
 * "development" export condition: `__DEV__` is true, so `useI18n()` outside a provider throws
 * a readable error.
 */
import { defineConfig } from "vite";
import { entries, external, output } from "./vite.entries.ts";

export default defineConfig({
  build: {
    emptyOutDir: false, // the production build already cleared dist/
    lib: { entry: entries(import.meta.dirname), name: "ComviSolid" },
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
