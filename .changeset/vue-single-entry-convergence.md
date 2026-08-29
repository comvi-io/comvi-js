---
"@comvi/vue": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/vue` now builds the base host.** Vue's `createI18n` is a real preset — it constructs a `VueI18n` around a `@comvi/core` host and applies `ssrLocale` before the reactive ref is seeded — and in 0.4 the host it constructed arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/vue/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported, `createCore` included, and it never published, so there is no deprecation debt.

Nothing about the preset itself changes: same call signature, same `ssrLocale` handling,
same `VueI18n`, same `app.use(i18n)` install, same composables, same `<T>`, same
`I18N_INJECTION_KEY`, and `createCore` / `createI18nFromCore` are untouched escape hatches.
**Where the pipe goes on vue:** `createI18n` returns a `VueI18n`, not the host, so `.with(…)`
lives one level down — on `i18n.core`, or on a host you build with `createCore` and hand to
`createI18nFromCore`. That is the one shape that differs from react, solid and svelte.

| you had                                      | you add                                                |
| -------------------------------------------- | ------------------------------------------------------ |
| ICU plurals, select, selectordinal           | `compiler: icuCompiler`, or `.with(icu())` on the core |
| loader (`registerLoader`, …)                 | `i18n.core.with(loader(map))`                          |
| `.use(plugin)`, `onMissingKey`               | `i18n.core.with(plugins())`, then `i18n.core.use(p)`   |
| discovery (`instanceId`, `window.__COMVI__`) | `i18n.core.with(devtools({ instanceId }))`             |
| nested constructor catalogs                  | `flattenCatalog(…)`, or compose `loader()`             |
| `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`           |

```ts
// INLINE — the preset ingests the catalog, so choose the compiler in the same call.
const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });

// REMOTE — install on the core, ahead of the first catalog.
const core = createCore({ locale: "en" }).with(icu()).with(loader(importMap));
const i18n = createI18nFromCore(core, { ssrLocale: "en" });
```

`.with(icu())` is **pre-ingestion only**: the compiler locks at the first catalog and a later
`icu()` throws with own `code === "E_COMPILER_LOCKED"`, so
`createI18n({ translation }).core.with(icu())` is invalid by construction.

**`<T>` changed seams.** It used to import `@comvi/core/tags`, the side-effectful subpath, so
rendering `<T>` anywhere also switched tag syntax on for every plain `t()` call — and off
again in any production build that pruned the component. It now imports the pure
`@comvi/core/rich-text` seam: rich-text rendering is unchanged, the accidental ambient switch
and its dev/prod divergence are gone, and `t("Click <b>here</b>")` stays literal until you
`import "@comvi/core/tags"` once at your own entry. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4 and
`core-single-entry-convergence.md`.
