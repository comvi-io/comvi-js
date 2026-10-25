import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      // `bundleTypes` BUNDLES the declarations into one `dist/index.d.ts`.
      // Required, not cosmetic: `@comvi/typegen` is workspace-private, so the
      // published `.d.ts` may not import `SchemaParam`/`KeySchema`/
      // `ProjectSchema` from it — the roll-up inlines those declarations.
      bundleTypes: {
        // api-extractor treats every dependency as external unless it is
        // listed here: without `bundledPackages` the rolled-up `.d.ts` still
        // imports the schema types from the private package.
        bundledPackages: ["@comvi/typegen"],
      },
    }),
  ],
  build: {
    // Explicit rather than relying on Vite's default inference (true when
    // outDir resolves inside root): this package has only one build step —
    // no `.dev`/umd follow-up — so every build must start from an empty
    // dist, and a stray file left by an unrelated prior layout must never
    // survive a real build invocation.
    emptyOutDir: true,
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
