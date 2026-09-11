---
"@comvi/core": minor
---

**BREAKING (breaking change on a 0.x minor): the root `@comvi/core` entry changes semantics.** `@comvi/core` is now ONE entry — the base host — and capability is an import you add, never an entry you switch. The second entry, `@comvi/core/slim`, is deleted; it never published, so there is no deprecation debt.

| what a 0.4 root had                          | on the converged root                 | compose it back                                                     |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| ICU plurals / select                         | dev throws, prod renders it literally | `compiler: icuCompiler` in the constructor options                  |
| `.use(plugin)`                               | absent — TS error + `TypeError`       | `.use(definePlugin(p))`, or `.use(plugins())` + `registerPlugin(p)` |
| loader (`registerLoader`, …)                 | absent — the loud capability error    | `.use(loader())`                                                    |
| discovery (`instanceId`, `window.__COMVI__`) | absent — invisible to the extension   | `.use(devtools())`                                                  |
| nested catalogs                              | stored verbatim, dev warning          | `flattenCatalog(…)`, or compose `loader()`                          |
| string-API tags (`"<b>hi</b>"`)              | literal text, dev warning             | `<T>`, or `import "@comvi/core/tags"`                               |

`new I18n(options)`, `@comvi/next`'s `createNextI18n` (now typed `NextComposedI18n<D>`) and
the batteries-included CDN global are unchanged.

```ts
// INLINE catalogs.
const i18n = createI18n({ locale: "en", translation, compiler: icuCompiler });
// REMOTE catalogs — the same option, in the same place.
const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(fetchLoader({ … }));
```

`compiler` is a constructor field held for the instance's life, so one option covers every
catalog source: a constructor `translation`, an `addTranslations` call, a loader merge. The
library has no ordering rule left, so `loader()`, `plugins()` and `devtools()` may be
composed in any order among themselves.

**The ICU failure is structured, and its context is yours.** Development throws where the
template is COMPILED — at ingestion for catalog strings, at first compile for one that
bypasses ingestion (a per-call `params.fallback`). Production never crashes: it renders the
braced segment literally and reports `E_ICU_SYNTAX` through `onError`, or `console.error`
when no handler is configured, on the compilation that hit it — best-effort, per process,
never on cached renders. The error owns exactly `code` and a truthful `argumentType`; key,
namespace and locale reach you through the report context, as
`{ source: "compile", key, namespace, locale }`.

**BREAKING for plugin authors: a plugin may only return nothing or a cleanup function.**
`init()` used to ignore any non-function return and now throws on any non-`undefined` one,
through the plugin lifecycle's normal error path. The shape that bites is the
expression-bodied arrow:

```diff
-i18n.registerPlugin(() => (ready = true));   // returns `true` — now throws
+i18n.registerPlugin(() => { ready = true; }); // returns nothing — fine
```

Residuals: `flattenCatalog` is exported from the root as well as `@comvi/core/loader`;
`@comvi/core/rich-text` is the pure `<T>` toolbox and `@comvi/core/tags` still registers
string-API tag syntax; `instanceId` is absent unless devtools is composed, and the
loader/plugin members are no longer on the prototype chain. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).
