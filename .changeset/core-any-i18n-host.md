---
"@comvi/core": minor
"@comvi/react": patch
"@comvi/solid": patch
"@comvi/svelte": patch
---

`AnyI18nInstance` — the host type a provider accepts whatever `defaultParams` type it carries, with the `strictFunctionTypes` invariance write-up — is declared once in `@comvi/core` and re-exported as a type by `@comvi/react`, `@comvi/solid` and `@comvi/svelte`, instead of three identical copies. No shape change; `scripts/wrapper-hooks-parity.test.mjs` now fails on a local re-declaration.
