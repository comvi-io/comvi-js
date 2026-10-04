---
"@comvi/next": minor
---

**BREAKING (breaking change on a 0.x minor): `createI18n` from `@comvi/next/client` now builds the base host.** That name is published 0.4.x API — on the client entry, on `@comvi/next/server` and on the `@comvi/next` root — and in 0.4 it arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Those five are now things a next app composes. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

**Grep target for a tree built against 0.5 development:** the second constructor name that briefly stood beside `createI18n` on both entries for the bare host was `createSlimI18n`. It is deleted — one host, one name — it never published, so rename it to `createI18n`, aliased imports included.

**`createNextI18n` from `@comvi/next` keeps every capability.** It composes ambient tags, the
loader (both `registerLoader` overloads), the plugin host, default params and devtools
discovery explicitly, inside this package, so it is still the one-line escape hatch if you do
not want to compose anything. The compiler is the exception, and it is a separate breaking
change in its own changeset: `createNextI18n` no longer defaults `compiler` to `icuCompiler`,
so an ICU catalog needs `compiler: icuCompiler` here as well. Its host type is now published
as `NextComposedI18n<D>`. Nothing about
`<I18nProvider>`, `useI18n()`, `<T>`, the capability hooks, `createMiddleware`,
`createNextI18nFromHost`, locale routing or navigation changes here.

Compose what you had back — every installer is re-exported from BOTH host entries, so each
fix stays inside the specifier you already import:

| you had                                      | you add                                            |
| -------------------------------------------- | -------------------------------------------------- |
| ICU plurals, select, selectordinal           | `compiler: icuCompiler` in the constructor options |
| loader (`registerLoader`, …)                 | `.use(loader(map))`, or `.use(attachLoader)`       |
| `.use(plugin)`, `onMissingKey`               | `.use(definePlugin(p))`, or `registerPlugin(p)`    |
| discovery (`instanceId`, `window.__COMVI__`) | `.use(devtools({ instanceId }))`                   |
| `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`       |

```tsx
// INLINE — the constructor ingests the catalog.
const i18n = createI18n({ locale: "en", compiler: icuCompiler, messages });
// LATER — a hydrated client catalog, or anything an SSR loader fetches: the same option.
const host = createI18n({ locale: "en", compiler: icuCompiler }).use(loader(importMap));
```

`compiler` is a constructor field held for the instance's life, so one option covers every
catalog source. A client host is hydrated rather than loaded, so nothing is ingested at
construction, and the option covers the hydrated catalog too.
`@comvi/next/server` exports that same base `createI18n` — the client/server split is a
runtime split, never a host-tier split.

Residual: `t("Click <b>here</b>")` returns markup as text, since neither entry registers tag
syntax ambiently. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §5 and
`core-single-entry-convergence.md`.
