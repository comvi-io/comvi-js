/**
 * Development ESM build (dist/comvi-core*.dev.js) — selected by bundlers via
 * the "development" export condition. __DEV__ is hardcoded true so error
 * messages stay readable in dev; the prod files keep E_* codes.
 */
import { defineConfig } from "vite";
import { resolve } from "path";
import pkg from "./package.json";
import {
  coreCodeSplitting,
  coreEntries,
  coreTreeshake,
  chunkFileName,
  entryFileName,
  keepRegisterSideEffect,
} from "./vite.shared";

export default defineConfig({
  plugins: [keepRegisterSideEffect],
  build: {
    emptyOutDir: false, // main build already cleared dist/
    lib: {
      entry: coreEntries(__dirname),
      name: "ComviCore",
    },
    minify: false,
    sourcemap: false,
    rolldownOptions: {
      external: [],
      preserveEntrySignatures: "allow-extension",
      output: [
        {
          format: "es",
          entryFileNames: (chunk) => entryFileName(chunk.name, ".dev"),
          chunkFileNames: (chunk) => chunkFileName(chunk.name, ".dev"),
          codeSplitting: coreCodeSplitting,
        },
      ],
      treeshake: coreTreeshake,
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    __DEV__: JSON.stringify(true),
    __VERSION__: JSON.stringify(pkg.version),
  },
});
