import { defineBuildConfig } from "unbuild";

// The workspace-private typegen package (`comvi.types`) is inlined into dist/module.mjs:
// it is never a dependency of the published package.
export default defineBuildConfig({
  rollup: { inlineDependencies: ["@comvi/typegen"] },
});
