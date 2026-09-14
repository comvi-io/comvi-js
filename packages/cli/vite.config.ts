import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      // `rollupTypes` BUNDLES the declarations into one `dist/index.d.ts`.
      // Required, not cosmetic: `@comvi/typegen` is workspace-private, so the
      // published `.d.ts` may not import `SchemaParam`/`KeySchema`/
      // `ProjectSchema` from it — the roll-up inlines those declarations.
      rollupTypes: true,
      // api-extractor treats every dependency as external unless it is listed
      // here: without `bundledPackages` the rolled-up `.d.ts` still imports
      // the schema types from the private package.
      bundledPackages: ["@comvi/typegen"],
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
        return `${entryName}.${format}.js`;
      },
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        // `@comvi/typegen` is deliberately ABSENT: it is workspace-private, so
        // rolldown must inline the emitter into this bundle.
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
