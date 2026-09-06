// Single source of truth for the publishable packages whose generated `.d.ts`
// the types-export gate verifies. Consumed by:
//   - scripts/check-types-exports.mjs (attw@bundler+node16, the node16 probe for
//     conditional `types` branches attw skips, and the empty-types content check)
//
// EVERY published package belongs here, whatever built it. `svelte`
// (svelte-package) and `nuxt` (nuxt-module-build) were once excluded with the note
// that they were "covered by publint" — they were not. publint validates the
// manifest and the files it names; it does not resolve specifiers INSIDE a
// declaration file, so `publint packages/svelte` printed "All good!" on a tree whose
// `dist/index.d.ts` re-exported from `"./types"`, unresolvable under node16. The
// exclusion is what let that ship, so the list is now exhaustive by construction:
// if a package is published, it is gated.
//
// All packages are ESM-only — there is no `.d.cts`/`require` condition anymore.
export const TYPED_PACKAGES = [
  "core",
  "react",
  "vue",
  "solid",
  "svelte",
  "next",
  "nuxt",
  "cli",
  "typegen",
  "vite-plugin",
  "locale-routing",
  "plugin-fetch-loader",
  "plugin-locale-detector",
  "plugin-in-context-editor",
];
