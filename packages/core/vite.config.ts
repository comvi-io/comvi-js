/**
 * Production ESM build of @comvi/core: one invocation for every entry, so shared
 * modules land in shared chunks. `__DEV__` is false: diagnostics fold out and the
 * production graph holds no console call (contract test). The development build is
 * vite.config.dev.ts, selected by the "development" export condition.
 */
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { entries, output } from "./vite.entries.ts";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    emptyOutDir: true,
    lib: { entry: entries(import.meta.dirname), name: "ComviCore" },
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      preserveEntrySignatures: "allow-extension",
      output: [output("")],
      treeshake: { moduleSideEffects: false },
    },
  },
  define: { __DEV__: JSON.stringify(false), __VERSION__: JSON.stringify(pkg.version) },
});
