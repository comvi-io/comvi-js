---
"@comvi/next": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/next/client` now builds the base host.** That name is published 0.4.x API — on the client entry, on `@comvi/next/server` and on the `@comvi/next` root — and in 0.4 it arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Those five are now things a next app composes. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

**Grep target for a tree built against 0.5 development:** the second constructor name that briefly stood beside `createI18n` on both entries for the bare host was `createSlimI18n`. It is deleted — one host, one name — it never published, and `pnpm codemod:framework-slim` renames it, aliased imports included.

**`createNextI18n` from `@comvi/next` is NOT affected.** It composes ICU, ambient tags, the
loader (both `registerLoader` overloads), the plugin host, nested constructor catalogs,
default params and devtools discovery explicitly, inside this package — so a 0.4 app built
on it migrates by changing nothing, and it is the one-line escape hatch if you do not want
to compose anything. Its host type is now published as `NextComposedI18n<D>`. Nothing about
`<I18nProvider>`, `useI18n()`, `<T>`, the capability hooks, `createMiddleware`,
`createNextI18nFromHost`, locale routing or navigation changes here.

Compose what you had back — every installer is re-exported from BOTH host entries, so each
fix stays inside the specifier you already import:

| you had                                      | you add                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| ICU plurals, select, selectordinal           | `compiler: icuCompiler`, or `.with(icu())` pre-ingestion |
| loader (`registerLoader`, …)                 | `.with(loader(map))`, or `.with(attachLoader)`           |
| `.use(plugin)`, `onMissingKey`               | `.with(plugins())`, then `use(p)`                        |
| discovery (`instanceId`, `window.__COMVI__`) | `.with(devtools({ instanceId }))`                        |
| nested constructor catalogs                  | `flattenCatalog(…)`, or compose `loader()`               |
| `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`             |

```tsx
// INLINE — the constructor ingests the catalog, so choose the compiler in the same call.
const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });
// LATER — a hydrated client catalog, or anything an SSR loader fetches.
const host = createI18n({ locale: "en" }).with(icu()).with(loader(importMap));
```

`.with(icu())` is **pre-ingestion only**: the compiler locks at the first catalog and a later
`icu()` throws with own `code === "E_COMPILER_LOCKED"`, typed by `CompilerLockedError`. A
client host is hydrated rather than loaded, so nothing is ingested at construction.
`@comvi/next/server` exports that same base `createI18n` — the client/server split is a
runtime split, never a host-tier split.

Residual: `t("Click <b>here</b>")` returns markup as text, since neither entry registers tag
syntax ambiently. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §6 and
`core-single-entry-convergence.md`.
