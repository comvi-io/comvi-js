---
"@comvi/next": patch
---

**Docs only.** The README's "three ways to get a host" table read like three peer
options; it is one: `createNextI18n(options).use(...)` is the recommendation,
`createNextI18nFromHost` is for a host built elsewhere, and `createI18n` (still
exported from both runtime entries) is for that factory and for 0.4 migration —
demoted to a mention in the export table rather than a coequal choice.

Added the two missing quickstarts, each a complete, lint-checked App Router app:
an inline-catalog app (`createNextI18n({ translation, compiler: icuCompiler })`,
no loader) and a `@comvi/plugin-fetch-loader/cdn` remote app
(`createNextI18n(...).use(cdnLoader({ cdnUrl }))`). The CDN quickstart spells
out the actual mechanism behind client-side ICU and the loader: the shared
`i18n/config.ts` module is evaluated once on the server and once again inside
the client bundle (`I18nClientProvider.tsx` imports it a second time, because
Next cannot pass a class instance across the Server/Client Component
boundary), so the client host gets `compiler: icuCompiler` and the composed
loader only because the same construction code runs twice — nothing is
serialized from the running server instance to the browser. Both quickstarts
were typechecked against a scratch copy of `test-apps/next` before writing.

The inline quickstart's catalog is keyed `"<locale>:<namespace>"` (`"en:default"`), not nested
`{ en: { default: … } }`: a colon-less top-level key is the LOCALE alone and its object is
flattened into the default namespace, so the nested form defined `default.greeting` and
`t("greeting")` rendered the literal key. Neither the snippet lint nor the snippet typecheck can
see that, so the catalog is now read out of the README fence and RUN by
`packages/next/tests/readme-inline-quickstart.test.ts`.
