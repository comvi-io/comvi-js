// Webpack leg of the bundler matrix. Entry/output come from the runner via
// BM_ENTRY / BM_OUT; mode comes from `--mode` so webpack applies its own
// default resolve conditions and sideEffects handling — the point of the gate
// is to observe stock consumer behavior, so nothing resolution-related is
// overridden here.
//
// The runner always builds with `--json <out>.stats.json` and reads
// `modules[].identifier` from it (the tag-sentinel module-graph assertion), so
// the stats preset must emit modules — including the ones
// ModuleConcatenationPlugin nests in production.
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const webpack = require("webpack");

export default (env, argv) => {
  const mode = argv.mode || "production";
  const entry = process.env.BM_ENTRY;
  const out = process.env.BM_OUT;
  if (!entry || !out) throw new Error("BM_ENTRY and BM_OUT must be set");

  return {
    mode,
    entry,
    target: "node18",
    devtool: false,
    output: {
      path: path.dirname(out),
      filename: path.basename(out),
      library: { type: "commonjs2" },
    },
    plugins: [
      // Vue esm-bundler feature flags (standard consumer configuration).
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: "true",
        __VUE_PROD_DEVTOOLS__: "false",
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
      }),
    ],
    stats: {
      preset: "errors-warnings",
      modules: true,
      nestedModules: true,
      modulesSpace: Infinity,
      ids: true,
    },
  };
};
