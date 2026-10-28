/**
 * Development ESM build (dist/comvi-react*.dev.js), selected by bundlers through the
 * "development" export condition: `__DEV__` is true, so a hook outside a provider throws
 * a readable error.
 */
import { defineConfig } from "vite";
import { entries, external, output, useClient } from "./vite.entries.ts";

export default defineConfig({
  plugins: [useClient],
  build: {
    emptyOutDir: false, // the production build already cleared dist/
    lib: { entry: entries(import.meta.dirname), name: "ComviReact" },
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
