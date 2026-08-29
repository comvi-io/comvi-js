---
"@comvi/core": minor
---

**BREAKING (0.x minor, WATCHDOG policy): the root `@comvi/core` entry changes semantics.** `@comvi/core` is now ONE entry — the base host — and capability is an import you add, never an entry you switch. The second entry, `@comvi/core/slim`, is deleted (it never published, so there is no deprecation debt). If you are on 0.4.x's root entry, read the table below before upgrading: ICU plurals now fail loudly instead of rendering wrong text, and `.use()`, the loader, devtools discovery and nested-catalog flattening are absent until composed.

### What a 0.4 root user experiences

| 0.4 root behaviour                                    | converged root          | loudness                                                             | migration                                                                                   |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ICU plurals / select                                  | not compiled by default | **dev throws; prod renders it literally and reports** `E_ICU_SYNTAX` | inline catalogs: `compiler: icuCompiler`; remote catalogs: `.with(icu())` BEFORE the loader |
| `.use(plugin)`                                        | absent                  | TS error + runtime `TypeError`                                       | `.with(plugins()).use(p)`                                                                   |
| loader (`registerLoader`, …)                          | absent                  | existing loud capability error                                       | `.with(loader())` or `fetchLoader(opts)`                                                    |
| devtools discovery (`instanceId`, `window.__COMVI__`) | absent                  | invisible to the browser extension (documented)                      | `.with(devtools())`, or the in-context-editor installer                                     |
| nested catalogs                                       | stored verbatim         | dev warning                                                          | `flattenCatalog(…)`, or compose `loader()`                                                  |
| string-API tags (`"<b>hi</b>"` through `t()`)         | literal text            | dev warning; prod literal                                            | `<T>` from your framework package, or `import "@comvi/core/tags"`                           |
| `new I18n(options)`                                   | unchanged, one argument | —                                                                    | —                                                                                           |
| published `createNextI18n`                            | unchanged composed host | —                                                                    | —                                                                                           |

### The compiler timing rule — read this before you migrate ICU

There are exactly two recipes, and which one you need depends on where the catalog comes from:

```ts
// INLINE catalogs — the constructor option. The catalog is ingested by the
// constructor itself, so the compiler must be chosen in the same call.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const i18n = createI18n({ locale: "en", translation, compiler: icuCompiler });

// REMOTE catalogs — the installer, BEFORE anything is ingested.
import { icu } from "@comvi/core/icu";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(icu()).with(fetchLoader({ … }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks irreversibly the moment ANY catalog reaches the host — a constructor `translation`, an `addTranslations` call (even an empty one), or a loader merge — and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"` _before_ mutating anything. `clearTranslations()` does not unlock it. `createI18n({ translation }).with(icu())` is therefore invalid by construction: in development the constructor's catalog check throws first, in production the host locks and the installer throws. Nothing is silently rekeyed or invalidated: the lock is what proves no compiled template can exist yet.

### The ICU failure is structured, and its context is yours

`E_ICU_SYNTAX` carries own `code` and a truthful own `argumentType` (`"plural"`, `"select"`, `"selectordinal"`, or the parsed token such as `"number"` / `"date"` / `"other"` — for which the message explicitly does NOT claim shipped ICU support) and **nothing else**. Locale, namespace, key and catalog source are application-supplied telemetry: add them at your own boundary.

Development is EAGER — the catalog is walked at both ingestion seams, so a bad template throws where it was ingested; the throw always lands where the template is COMPILED, so one that bypasses ingestion (a per-call `params.fallback`) throws at its first compile instead. Production never crashes on it: it renders the braced segment literally and reports `E_ICU_SYNTAX` through `onError` (or `console.error` when no handler is configured) on the compilation that hit it — best-effort, per process, never on cached renders. The report's context carries `source: "compile"` plus the `key`, `namespace` and `locale` the compiler itself cannot see.

### Preserved on purpose

- **`new I18n(options)` stays one-argument** with simple-compiler semantics; the internal compiler parameter is not part of the published construct signature.
- **`@comvi/next`'s `createNextI18n` keeps its composed semantics verbatim** — ICU, ambient tags, both `registerLoader` overloads (function and static import map), the plugin lifecycle, nested constructor catalogs, default params, devtools discovery and every `result.use*` method. The host type is now published explicitly as `NextComposedI18n<D>`.
- **The CDN global stays batteries-included.** `unpkg`/`jsdelivr` serve a bundle built from its own entry, and it additionally exposes `icuCompiler`, `flattenCatalog`, `prepareTranslation`, `registerTagSyntax` and `tagSyntaxExtension` — a `<script src>` consumer has no import graph to extend. This ESM-base / global-composed split is deliberate.
- `flattenCatalog` is exported from the root as well as from `@comvi/core/loader`.
- **`@comvi/core/rich-text` is the pure framework-component toolbox.** It exports `prepareTranslation` and the VirtualNode helpers without ambient registration. `@comvi/core/tags` still registers string-API tag syntax and re-exports the same toolbox; framework `<T>` components use the pure seam.

### BREAKING for plugin authors: a plugin may only return nothing or a cleanup function

`@comvi/core/plugins` used to ignore whatever a plugin returned unless it was a function. It now **throws** at `init()` on any other value, through the plugin lifecycle's normal error path (`onError`, `reportError`, and a rethrow when the entry is required). Nothing is registered and no cleanup is queued.

This matches the published `I18nPlugin` type, which has always been `void | Promise<void> | PluginCleanup | Promise<PluginCleanup>` — a union, so TypeScript's "any return type satisfies `void`" rule never applied to it. What changes is that the runtime now agrees. The shape that actually bites is the expression-bodied arrow:

```diff
-i18n.use(() => (ready = true));   // returns `true` — now throws
+i18n.use(() => { ready = true; }); // returns nothing — fine
```

The reason it is worth a throw: a lowercase plugin-package installer returns the HOST, and `.use(inContextEditor())` under the `production` condition is exactly that shape. Silently ignoring it would leave the editor unregistered with no signal.

### Installers and plugins reject each other's slot

`.with` stays a dumb pipe — no registry, no ordering, no branding — so the two are told apart by their signatures, and both cross-uses are type errors. At runtime:

- `.use(lowercaseInstaller(…))` fails at `init()` on the installer's first ensure-step, before any capability is attached and before a second plugin reaches the queue. `@comvi/core/plugins` exports the guard behind it, `ensureInstallable(host, name)`, so third-party installers get the same behaviour and the same actionable message.
- `.with(UppercasePlugin(…))` calls the plugin against a host without the capabilities it needs, so the invocation is rejected.

Both guards live in `@comvi/core/plugins`: a base host that composes no plugin capability carries neither.

### Reflective consumers

The instance's own-property set changes again on the base host: `instanceId` is absent unless the devtools capability is installed, and the loader/plugin members are no longer on the prototype chain. Code that enumerates or feature-detects the instance should read the composed host it actually built.
