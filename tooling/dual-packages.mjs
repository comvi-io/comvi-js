// Single source of truth for the list of packages that publish BOTH ESM and CJS
// with `require` conditions in their exports map. Consumed by:
//   - tooling/emit-d-cts.mjs         (emits .d.cts twins post-build)
//   - scripts/check-types-exports.mjs (attw verification of the same set)
// Drift between the two would silently desync emit vs verify coverage, so any
// new dual-published package MUST be added here, not in either consumer.
//
// ESM-only packages (svelte, nuxt) are intentionally absent — they have no
// `require` condition.
export const DUAL_PACKAGES = [
  "core",
  "react",
  "vue",
  "solid",
  "next",
  "cli",
  "vite-plugin",
  "plugin-fetch-loader",
  "plugin-locale-detector",
  "plugin-in-context-editor",
];
