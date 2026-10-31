/**
 * Production ESM build of @comvi/solid: `.` and `./format` in one invocation, so `/format`
 * shares the binding module instead of copying it. The source has no JSX, so one build serves
 * the browser and the server: `solid-js/web` resolves to the side it runs on. `__DEV__` is
 * false: diagnostics fold out. The development build is vite.config.dev.ts, selected by the
 * "development" export condition.
 */
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { entries, external, output } from "./vite.entries.ts";

export default defineConfig({
  plugins: [dts({ insertTypesEntry: true })],
  build: {
    emptyOutDir: true,
    lib: { entry: entries(import.meta.dirname), name: "ComviSolid" },
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
