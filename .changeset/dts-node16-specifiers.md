---
"@comvi/plugin-fetch-loader": patch
"@comvi/plugin-in-context-editor": patch
"@comvi/core": patch
"@comvi/next": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
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
  **zero exported members**, so `import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn"`
  failed with `TS2305 ... has no exported member 'cdnLoader'`. `@comvi/core` and
  `@comvi/plugin-in-context-editor` had the same shape on `export type * from './types'` and
  `export * from './entry-production'`.
- Every other entry used named re-exports (`export { X } from './options'`). Those keep the
  name but bind it to an unresolved module, so `X` silently became `any`. With the
  `skipLibCheck: true` nearly every app sets, a node16 consumer got **no diagnostic at
  all**: `createI18n(123)` type-checked. The packages looked typed and checked nothing.

Bundler-resolution consumers (Vite, and Next.js projects on the `bundler` default) were
never affected — their types were correct throughout. Consumers on `node16`/`nodenext` get
real types for the first time.

`pnpm check:types-exports` now walks the published declaration graph under node16's ESM
rules and fails on any specifier it cannot resolve, separating the star shape (a consumer
`TS2305`) from the named shape (a silent `any`). attw does not report either one: it only
flags internal resolution failures under the `bundler` mode this repo asked it about, which
is why the defect shipped.
