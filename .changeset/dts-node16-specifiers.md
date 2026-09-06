---
"@comvi/plugin-fetch-loader": patch
"@comvi/plugin-in-context-editor": patch
"@comvi/core": patch
"@comvi/next": patch
"@comvi/nuxt": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

The shipped `.d.ts` files now use extension-qualified relative specifiers (`./options.js`,
`./cdn/index.js`), so the published types resolve under `moduleResolution: node16` and
`nodenext` — the mode a Node ESM package or a `"type": "module"` app gets by default.

Previously every relative specifier in the emitted declarations was extensionless, inherited
verbatim from sources written for `moduleResolution: "bundler"`. Bundler resolution
substitutes extensions; node16 does not, and it has no directory-index lookup either. The
damage had two shapes, and only one of them was loud:

- `@comvi/plugin-fetch-loader/cdn` shipped `dist/cdn.d.ts` as `export * from './cdn/index'`.
  A star re-export from an unresolved module contributes no names, so the entry point had
  **zero exported members**, and `import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn"`
  failed with `TS2305 ... has no exported member 'cdnLoader'`. `@comvi/core` and
  `@comvi/plugin-in-context-editor` had the same shape on `export type * from './types'` and
  `export * from './entry-production'`.
- Every other entry used named re-exports (`export { X } from './options'`). Those keep the
  name but bind it to an unresolved module, so `X` silently became `any`. With the
  `skipLibCheck: true` nearly every app sets, a node16 consumer got **no diagnostic at
  all**: `createI18n(123)` type-checked. The packages looked typed and checked nothing.

**On upgrade, a `node16`/`nodenext` project may see NEW type errors in its own code.** Those
errors were always there — the types that would have reported them were `any`. Code written
against the real signatures needs no change.

Bundler-resolution consumers (Vite, and Next.js projects on the `bundler` default) were
never affected — their types were correct throughout. Consumers on `node16`/`nodenext` get
real types for the first time.

`pnpm check:types-exports` now gates attw's `node16` resolution mode in addition to
`bundler`. attw detects this defect perfectly well — 10 × `InternalResolutionError` on
`@comvi/plugin-fetch-loader` alone, `./cdn/index` among them. It was a single line in the
repo's own wrapper that suppressed the entire node16 report, so the gate was green on a
broken tree. The gate also grew a small probe for the one thing attw cannot reach: attw
resolves entry points with a fixed condition set, so a `types` branch under a custom
condition — `@comvi/plugin-in-context-editor`'s `"types": { "production": … }` — is never
visited, and that is exactly where `export * from './entry-production'` was hiding.

`@comvi/svelte` and `@comvi/nuxt` were previously excluded from that gate as "covered by
publint". They were not: publint validates the manifest, not resolution inside a declaration
file, and printed "All good!" on both broken trees. Every published package is now gated.

Follow-up, deliberately NOT in this release: the declarations are corrected by a post-build
rewrite (`tooling/qualify-dts-specifiers.mjs`) wired into each package's build. Writing the
`.js` extension in the SOURCES instead is legal under `moduleResolution: "bundler"` and is
emitted verbatim, which would let the rewriter be deleted and would cover `svelte-package`
and `nuxt-module-build` without per-package wiring — one codemod over 566 extensionless
relative imports across 161 files. Neither `moduleResolution: node16` in the emitting
tsconfig nor `rewriteRelativeImportExtensions` is a substitute.
