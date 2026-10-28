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
// WORKSPACE-PRIVATE packages are deliberately absent: `locale-routing` and
// `typegen` (`"private": true`) publish no tarball, so there is no consumer
// resolution to gate. What IS gated is that nothing published NAMES them — they
// are inlined into next/cli/vite-plugin and vendored into nuxt's runtime, and
// attw would report an unresolvable specifier here if a `.d.ts` still imported
// one.
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
  "vite-plugin",
  "plugin-in-context-editor",
];
