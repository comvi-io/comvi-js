---
"@comvi/vue": minor
---

**BREAKING (breaking change on a 0.x minor): `createI18n` from `@comvi/vue` now builds the base host.** Vue's `createI18n` is a real preset — it constructs a `VueI18n` around a `@comvi/core` host and applies `ssrLocale` before the reactive ref is seeded — and in 0.4 the host it constructed arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

**Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/vue/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported that still exists, and it never published, so there is no deprecation debt.

Nothing about the preset itself changes: same call signature, same `ssrLocale` handling,
same `VueI18n`, same `app.use(i18n)` install, same composables, same `<T>`, same
`I18N_INJECTION_KEY`, and `createI18nFromCore` is the untouched escape hatch for a host built
elsewhere — with `createI18n` from `@comvi/core` now, since the `createCore` alias is gone
(`vue-drop-create-core.md`).
**Where the pipe goes on vue:** on the `createI18n` result. `VueI18n` has its own
`.use(installer)`, which runs the installer on `i18n.core`, hands back the same instance and
widens the type of `core` by what was composed — so the chain reads like the react, solid and
svelte one. The one shape that still differs is registration: the wrapper does not proxy plugin
registration, so a plugin goes to `i18n.core.registerPlugin(…)`, or into the chain as
`.use(definePlugin(p))`.

| you had                                      | you add                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| ICU plurals, select, selectordinal           | `compiler: icuCompiler` in the constructor options        |
| loader (`registerLoader`, …)                 | `createI18n(options).use(loader(map))`                    |
| `.use(plugin)`, `onMissingKey`               | `.use(definePlugin(p))`, or `i18n.core.registerPlugin(p)` |
| discovery (`instanceId`, `window.__COMVI__`) | `.use(devtools({ instanceId }))`                          |
| `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`              |

```ts
// INLINE — the preset ingests the catalog.
const inline = createI18n({ locale: "en", compiler: icuCompiler, translation });

// REMOTE — the same option; the loader composes on the result.
const remote = createI18n({ locale: "en", ssrLocale: "en", compiler: icuCompiler }).use(
  loader(importMap),
);
```

`compiler` is a constructor field held for the instance's life, so one option covers every
catalog source. The one ordering rule left is vue's own: compose before `app.use(i18n)`.

**`<T>` changed seams.** It used to import `@comvi/core/tags`, the side-effectful subpath, so
rendering `<T>` anywhere also switched tag syntax on for every plain `t()` call — and off
again in any production build that pruned the component. It now imports the pure
`@comvi/core/rich-text` seam: rich-text rendering is unchanged, the accidental ambient switch
and its dev/prod divergence are gone, and `t("Click <b>here</b>")` stays literal until you
`import "@comvi/core/tags"` once at your own entry. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §3 and
`core-single-entry-convergence.md`.
