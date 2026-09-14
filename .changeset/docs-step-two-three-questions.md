---
"@comvi/core": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/next": patch
"@comvi/nuxt": patch
---

Docs: the "Connect to Comvi" step now reads as three questions, in the same order and the same words on every README — which parser (`compiler: icuCompiler`, with the failure mode spelled out: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced message literally and reports it once), where the catalog comes from (`.use(cdnLoader({ cdnUrl }))`), and what to paint while it is in flight. Only the third answer differs between frameworks, and three of the seven have no gate to write at all; the code fences are unchanged.

The root README also gains a **Reading the type errors** section: the three diagnostics a 0.4 app meets first — a typed key called without a required parameter, a member that moved off `useI18n()`, and a raw plugin factory in the `.use(…)` slot — each quoted verbatim from `tsc` or node, with the two compile errors pinned by `check=expect-error` so a drifting message is a docs-gate failure rather than a stale paragraph.
