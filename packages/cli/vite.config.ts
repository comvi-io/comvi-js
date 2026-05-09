import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        cli: resolve(__dirname, "src/cli/index.ts"),
      },
      name: "ComviCli",
      fileName: (format, entryName) => {
        if (format === "es") return `${entryName}.js`;
        if (format === "cjs") return `${entryName}.cjs`;
        return `${entryName}.${format}.js`;
      },
      formats: ["es", "cjs"],
    },
    rolldownOptions: {
      external: [
        "commander",
        "eventsource",
        "fs",
        "path",
        "crypto",
        "node:fs",
        "node:path",
        "node:fs/promises",
        "node:crypto",
        "node:process",
        "node:readline/promises",
        "node:util",
      ],
      output: [
        {
          format: "es",
          preserveModules: false,
        },
        {
          format: "cjs",
          preserveModules: false,
        },
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
