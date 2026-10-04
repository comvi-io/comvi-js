---
"@comvi/core": patch
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/next": patch
"@comvi/nuxt": patch
---

Docs: the house ICU failure sentence was only true of an INLINE catalog, and every quickstart that carries it prescribes a loader. It now states both paths, in the same words on the root README, all seven package READMEs and `docs/design/icu.md`: development fails at ingestion before anything renders, inline by throwing `E_ICU_SYNTAX` at the call that carries the catalog, and over a loader by failing that namespace's load — `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and `init()` rejects with `[@comvi/core] Failed to load all namespaces …` rather than with `E_ICU_SYNTAX`, so a provider with a `fallback` keeps painting it. The production half is unchanged. What a reader saw before was a promise of an error code that never reaches their `onError` and a spinner that never clears, described as "before anything renders".

New tests pin the loader path rather than the mechanism: `packages/core/tests/features/loader-icu-preflight.test.ts` for what `init()` rejects with, where `E_ICU_SYNTAX` is delivered, and the partial-failure case where `init()` still resolves; `packages/react/tests/loader-icu-fallback.test.tsx` for the fallback that stays painted and the error the provider reports.

[The 0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §7 gains the same correction plus three fixes: `E_USE_HOST_IDENTITY` is raised by `@comvi/next` as well as `@comvi/vue` (the `createNextI18n` result's `.use(f)`, when `f` hands back a different object), `E_LOADER_IMPORT_MAP` gets the row and the exact dev/prod text it was missing, and the section now says which names are branchable `code` properties and which — the capability-missing pair included — are message text only.
