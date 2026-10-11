import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import pkg from "./package.json";
import {
  coreCodeSplitting,
  coreEntries,
  coreTreeshake,
  chunkFileName,
  entryFileName,
  keepRegisterSideEffect,
  mangleInternalProps,
} from "./vite.shared";

export default defineConfig({
  plugins: [
    keepRegisterSideEffect,
    mangleInternalProps(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    emptyOutDir: true,
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
          entryFileNames: (chunk) => entryFileName(chunk.name, ""),
          chunkFileNames: (chunk) => chunkFileName(chunk.name, ""),
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
    // The published comvi-core*.js files are always the prod artifacts; the
    // dev build (vite.config.dev.ts) ships readable messages via the
    // "development" export condition.
    __DEV__: JSON.stringify(false),
    __VERSION__: JSON.stringify(pkg.version),
  },
});
