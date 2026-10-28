/**
 * Production ESM build of @comvi/react: `.` and `./format` in one invocation, so `/format`
 * shares the binding module instead of copying it (one React context, not two).
 * `__DEV__` is false: diagnostics fold out. The development build is vite.config.dev.ts,
 * selected by the "development" export condition.
 */
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { entries, external, output, useClient } from "./vite.entries.ts";

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true }), useClient],
  build: {
    emptyOutDir: true,
    lib: { entry: entries(import.meta.dirname), name: "ComviReact" },
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      external,
      preserveEntrySignatures: "allow-extension",
      output: [output("")],
      treeshake: { moduleSideEffects: false },
    },
  },
  define: { __DEV__: JSON.stringify(false) },
});
