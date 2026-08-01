// Vite leg of the bundler matrix. Entry/output come from the runner via
// BM_ENTRY / BM_OUT; `--mode development|production` drives NODE_ENV and with
// it Vite's `development|production` resolve condition. Library mode bundles
// node_modules (nothing external), so the packed tarballs go through Vite's
// resolver + sideEffects handling exactly like an app build.
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const entry = process.env.BM_ENTRY;
  const out = process.env.BM_OUT;
  if (!entry || !out) throw new Error("BM_ENTRY and BM_OUT must be set");

  return {
    logLevel: "warn",
    define: {
      // Vue esm-bundler feature flags (standard consumer configuration).
      __VUE_OPTIONS_API__: "true",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    build: {
      target: "node18",
      minify: mode === "production" ? "esbuild" : false,
      emptyOutDir: false,
      outDir: path.dirname(out),
      lib: {
        entry,
        formats: ["es"],
        fileName: () => path.basename(out),
      },
    },
  };
});
