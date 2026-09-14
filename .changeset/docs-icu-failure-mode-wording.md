---
"@comvi/core": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/next": patch
"@comvi/nuxt": patch
---

Docs: the ICU failure mode is now stated in one sentence, identical on the root README and all seven framework READMEs — development throws `E_ICU_SYNTAX` the moment the catalog is loaded, before anything renders; production renders the message text literally and reports through `onError`, or `console.error` when no handler is set. The design note in `docs/design/icu.md` gains a paragraph placing that behaviour against the other runtimes: the production half is what most of them do, and the development throw at catalog load is the part unique to Comvi, because a throw at the `t()` call only finds the ICU keys someone actually rendered.
