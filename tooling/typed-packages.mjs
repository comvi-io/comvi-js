// Single source of truth for the publishable packages whose generated `.d.ts`
// the types-export gate verifies. Consumed by:
//   - scripts/check-types-exports.mjs (attw@bundler + empty-types content check)
// These are the packages built via Vite + vite-plugin-dts (one ESM `.d.ts` per
// entry). `svelte` (svelte-package) and `nuxt` (nuxt-module-build) use their own
// framework build tooling and are covered by publint, so they are not listed here.
// All packages are ESM-only — there is no `.d.cts`/`require` condition anymore.
export const TYPED_PACKAGES = [
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
