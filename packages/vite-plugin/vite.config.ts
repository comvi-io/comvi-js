import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { createPluginBuildOptions } from "@comvi/vite-config";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      // Bundles the declarations into one `dist/index.d.ts`: `@comvi/typegen`
      // is workspace-private, so the published `.d.ts` may not name it.
      rollupTypes: true,
      // api-extractor treats every dependency as external unless it is listed
      // here: without `bundledPackages` the rolled-up `.d.ts` still IMPORTS
      // `SchemaParam`/`KeySchema`/`ProjectSchema`/`EmitOptions` from the
      // private package. Listing it inlines those declarations instead.
      bundledPackages: ["@comvi/typegen"],
    }),
  ],
  build: createPluginBuildOptions({
    entry: resolve(__dirname, "src/index.ts"),
    name: "ComviVitePlugin",
    // `@comvi/typegen` is deliberately absent: workspace-private, so the
    // emitter is inlined into this bundle.
    external: ["vite", "node:fs", "node:fs/promises", "node:path"],
  }),
});
