/**
 * Development ESM build (dist/comvi-core*.dev.js), selected by bundlers through the
 * "development" export condition: `__DEV__` is true, so syntax and missing-param
 * reports carry readable messages and the default reporter prints them once.
 */
import { defineConfig } from "vite";
import { entries, output } from "./vite.entries.ts";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  build: {
    emptyOutDir: false, // the production build already cleared dist/
    lib: { entry: entries(import.meta.dirname), name: "ComviCore" },
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      preserveEntrySignatures: "allow-extension",
      output: [output(".dev")],
      treeshake: { moduleSideEffects: false },
    },
  },
  define: { __DEV__: JSON.stringify(true), __VERSION__: JSON.stringify(pkg.version) },
});
