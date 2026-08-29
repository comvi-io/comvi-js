# Migrating to comvi 0.5.0 — one entry per package

Upgrading from **0.4.x** (0.5.x was never published). Two things changed, and the
first is a **breaking change to published API** riding the pre-1.0 minor-bump
policy:

0. **`@comvi/core` is now ONE entry — the base host.** Capability is an import
   you add, never an entry you switch. §0 is the whole story.
1. Every framework binding runs on that host, which moved four loader/plugin
   members out of `useI18n()` (§1 onwards). Mechanical, and mostly codemodded.

---

## 0. The root entry changed semantics

The 0.4 root was batteries-included. The converged root is the base host: text +
`{param}` interpolation, the cache, events, default params and `.with()`.

| 0.4 root behaviour                           | converged root                        | migration                                                |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| ICU plurals / select                         | dev throws, prod renders it literally | `compiler: icuCompiler`, or `.with(icu())` pre-ingestion |
| `.use(plugin)`                               | absent — TS error + `TypeError`       | `.with(plugins()).use(p)`, or a lowercase installer      |
| loader (`registerLoader`, …)                 | absent — the loud capability error    | `.with(loader())`, or `fetchLoader(opts)`                |
| discovery (`instanceId`, `window.__COMVI__`) | absent — invisible to the extension   | `.with(devtools())`, or `inContextEditor()`              |
| nested catalogs                              | stored verbatim, dev warning          | `flattenCatalog(…)`, or compose `loader()`               |
| string-API tags (`"<b>hi</b>"`)              | literal text, dev warning             | `<T>`, or `import "@comvi/core/tags"`                    |
| a plugin returning a value                   | throws at `init()`                    | return nothing, or a cleanup function                    |
| `new I18n(options)`                          | unchanged, one argument               | —                                                        |
| `createNextI18n`, the CDN global             | unchanged, still batteries-included   | —                                                        |

Also new on every host: a missing interpolation parameter renders as the literal
placeholder — `t("greet")` on `"Hello, {name}!"` now gives `"Hello, {name}!"`,
not `"Hello, !"`, plus one dev warning per (template, parameter). An explicit
`null` still renders as an empty string. Opt out with `missingParam: "drop"`.

### 0.1 The compiler has a timing rule

```ts
// INLINE catalogs — the constructor ingests them, so choose the compiler here.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
const i18n = createI18n({ locale: "en", translation, compiler: icuCompiler });

// REMOTE catalogs — the installer, ahead of the first catalog.
import { icu } from "@comvi/core/icu";
const i18n = createI18n({ locale: "en" }).with(icu()).with(fetchLoader({ … }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks irreversibly at the
first catalog that reaches the host — a constructor `translation`, an
`addTranslations` call (even an empty one), or a loader merge — and a later
`icu()` throws with own `code === "E_COMPILER_LOCKED"` before mutating anything,
in development and production alike. `clearTranslations()` does not unlock it. So
`createI18n({ translation }).with(icu())` is invalid by construction.

That is the library's **only** ordering rule. Composing a loader ingests nothing,
so `.with(loader(map)).with(icu())` is fine; the order of `loader()`, `plugins()`
and `devtools()` among themselves is free, and all three only have to be composed
before `init()`. (Composing or registering after `init()` warns once per host in
development; production is unchanged.)

### 0.2 The ICU failure, and how to report it

Under the default compiler an ICU template never renders as a plural.
**Development throws at ingestion** — the throw lands where the template is
compiled, so a catalog string throws where it entered, and one that never passes
through ingestion (a per-call `params.fallback`) throws at its first compile.
**Production never crashes:** the braced segment renders literally, exactly as
authored, and `E_ICU_SYNTAX` is reported through `onError` — or `console.error`
when no handler is configured — on the compilation that hit it. Best-effort, per
process, never on cached renders.

`E_ICU_SYNTAX` owns exactly `code` and a truthful `argumentType` (`"plural"`,
`"select"`, `"selectordinal"`, or the parsed token such as `"number"` /
`"date"` / `"other"`, for which the message does not claim shipped ICU support).
Locale, namespace, key and catalog source are yours; the host passes what it does
know through the report context:

```ts
const i18n = createI18n({
  locale: "en",
  onError(error, context) {
    // context: { source: "compile", key, namespace, locale }
    if ((error as { code?: string }).code === "E_ICU_SYNTAX") report(error, context);
  },
});
```

### 0.3 Residuals

- **String-API tags without a tag extension render literally** (dev warns). The
  fix, `import "@comvi/core/tags"`, registers the grammar **process-wide and
  retroactively** — a property of the bundle, not of one host, so every instance
  in the graph including already-built ones starts parsing tags, with no
  per-instance opt-out. SSR apps must import it in the **server** graph too, or a
  string renders literally on the server and with markup on the client.
- **Discovery is opt-in.** An app on the base host is invisible to the browser
  extension until it composes `devtools()` or the in-context-editor installer.
  The extension must be **0.5.0 or newer**: `window.__COMVI__` is protocol v2 (a
  queue the consumer drains and hooks), and old extension + new core is the one
  unsupported pairing.
- **Reflective consumers**: `instanceId` is absent unless discovery is installed,
  and the loader/plugin members are no longer on the prototype chain.
  `@comvi/core` is also compiled with `useDefineForClassFields: false`, so a
  declared-but-unassigned field is not an own property and own-property order is
  assignment order — on an instance that did not expose itself, `Object.keys()`
  and `{ ...i18n }` no longer list `instanceId`, though `i18n.instanceId` still
  reads `undefined`. Every public method and accessor is still a non-enumerable
  prototype member with unchanged descriptors.

## 1. Why the hooks moved

`useI18n()` used to hand you `addActiveNamespace`, `reloadTranslations`,
`onLoadError` and `onMissingKey`, which belong to the `@comvi/core/loader` and
`@comvi/core/plugins` capabilities rather than to the translation core — so its
return type promised methods a base host does not have (svelte crashed outright,
solid deferred the crash to the call site, react and vue typed them present and
failed later). 0.5.0 makes the common hook type-honest **by absence**: the four
members are gone from its return, in types and at runtime, and are acquired
explicitly instead — a host without the capability then fails at that one call
with a message naming the fix.

## 2. The migration table

| 0.4.x                                                | 0.5.0                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `const { reloadTranslations, … } = useI18n()`        | `const { reloadTranslations, addActiveNamespaces, … } = useI18nLoader()` |
| `const { onMissingKey } = useI18n()`                 | `const { onMissingKey } = useI18nPlugins()`                              |
| `useI18n("ns")` for a capability member              | `useI18n("ns")` keeps `t`; the capability APIs take no argument          |
| vue `i18n.registerLoader(…)`, `.use(…)`, six more    | `i18n.core.*` — `VueI18n` exposes its host as `readonly core`            |
| vue `new VueI18n(options)`                           | `createI18n(options)`; the constructor takes `(core, vueOptions)`        |
| svelte/solid `getI18nContext().reloadTranslations()` | `useI18nLoader()` in a component, or hold your own host                  |
| nuxt `comvi.setup` calling a dropped `VueI18n` proxy | `i18n.core.*`                                                            |
| next: a second `setI18n(other)`                      | one configuration source per process — §6                                |

`useI18nLoader()` and `useI18nPlugins()` ship from every binding
(`@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`,
`@comvi/next/client`; auto-imported in `@comvi/nuxt`) under those exact names, so
one grep finds the whole surface. Neither takes a namespace argument, and the bag
they return is referentially stable per host instance.

## 3. The codemod

```
pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx,vue,svelte}" [--report report.json]
```

Exit `0` = clean or fully transformed, `2` = rewrites applied **and** manual
items remain, `1` = error. One command covers both halves of 0.5.0.

For the **hooks** it rewrites pure, mixed, aliased and repeated destructures,
drops the now-illegal namespace argument from the capability call, merges into a
capability destructure already present in the same function, and maintains the
import statement. For the **single entry** it migrates host construction:

| shape                                                        | becomes                                    |
| ------------------------------------------------------------ | ------------------------------------------ |
| `@comvi/<pkg>/slim` — react, solid, svelte, vue, next client | `@comvi/<pkg>`                             |
| `@comvi/core/slim`                                           | `@comvi/core`                              |
| `createSlimI18n`                                             | `createI18n` (import, references, aliases) |
| `.use(FetchLoader(o))` + the two other first-party factories | `.with(fetchLoader(o))` in place           |
| `.use(YourPlugin(o))`                                        | `.with(plugins()).use(YourPlugin(o))`      |
| inline `translation` with ICU comma syntax                   | `compiler: icuCompiler` in the same call   |
| `exposeGlobal` / `instanceId` options                        | `.with(devtools({ … }))`, options moved    |
| a nested inline `translation` catalog                        | `flattenCatalog(…)`, per locale            |
| `.with(icu())` after a loader in one chain                   | `icu()` hoisted ahead of the first catalog |

That last row is cosmetic, not a rule: `.with(loader(map)).with(icu())` already
works (§0.1). A chain is the unit — `createI18n(…)` plus the `.use` / `.with`
calls chained onto it — so nothing outside one is guessed at. Imports are
maintained in the same pass, `new I18n(options)` migrates like
`createI18n(options)`, comments and CRLF endings survive, and a second run is a
byte-identical no-op.

**It never rewrites silently.** These are reported (`path:line:column`, as a list
and as JSON) and left alone:

- rest spreads, computed member access
- a hook result stored in a variable, or crossing a function boundary
- a local name that would collide with a hook or installer it wants to introduce
- `useI18n` / `createI18n` from a relative path or a nuxt auto-import
  (`manual-import`) — it will not guess where the capability API lives
- `.vue` / `.svelte` script blocks that fail extraction
- the eight dropped `VueI18n` proxies in `.vue` and `comvi.setup.*` files:
  `i18n.reloadTranslations()` may be a `VueI18n` (migrate to `i18n.core.*`) or a
  raw core instance (already correct), and the receiver's type is undecidable
- `.use(...plugins)`, `.use([a, b])`, `.use(registry[key])` and every `.use`
  whose plugin is not a statically named factory call, plus `.use` on a stored
  host — the fix is a change at CONSTRUCTION, so the recipe is printed instead
- a first-party factory NAME that is not a first-party import
- `exposeGlobal` / `instanceId` beside a chain that already composes `devtools(…)`
- `createI18n(optionsBuiltElsewhere)`, whose contents it cannot see
- catalogs loaded at RUNTIME — nothing textual proves what a CDN returns, so
  every loader chain without a compiler gets an advisory

## 4. Per binding

### One package per app

A host used to take two packages: the constructor from `@comvi/core`, the
bindings from `@comvi/<framework>`. Each framework package now carries the base
constructor and the capability toolkit on the ONE entry it publishes.

| binding         | specifier                                  | host constructor                                   |
| --------------- | ------------------------------------------ | -------------------------------------------------- |
| `@comvi/react`  | `@comvi/react`                             | `createI18n`                                       |
| `@comvi/solid`  | `@comvi/solid`                             | `createI18n`                                       |
| `@comvi/svelte` | `@comvi/svelte`                            | `createI18n`                                       |
| `@comvi/vue`    | `@comvi/vue`                               | `createI18n` / `createCore` / `createI18nFromCore` |
| `@comvi/next`   | `@comvi/next/client`, `@comvi/next/server` | `createI18n` — §6                                  |
| `@comvi/nuxt`   | auto-imported                              | generated, or `hostModule` — §7                    |

Next's two entries are a RUNTIME split, not a host-tier split: both publish the
same base constructor and the same toolkit. Nine capability bindings are
re-exported **by name** on each entry — `icu`, `icuCompiler`, `loader`,
`attachLoader`, `flattenCatalog`, `plugins`, `attachPlugins`, `devtools`,
`attachDevtools` — plus the base `I18n` class and the core type vocabulary, so
the remote-catalog ICU recipe is reachable from the one import an app already
has, and the bindings you never call are pruned by your bundler. `@comvi/nuxt` is
the deliberate exception and re-exports nothing (§7). `createI18n` IS core's own
constructor everywhere but `@comvi/vue`, whose `createI18n` builds the `VueI18n`
preset around it; there, `createCore` is core's constructor and
`createI18nFromCore` takes a host you built yourself.

**Every 0.4.x import path still resolves.** What changed is the HOST those
entries construct, not the specifier you write. And since each package publishes
one entry, the old entry-mixing hazard is gone: no import path can put a second
copy of a binding in your graph, so a provider and a hook in one app always see
each other.

`@comvi/core/tags` is deliberately **not** re-exported by any binding: importing
it registers tag syntax ambiently, a side effect no framework entry should hand
you by accident. Every `<T>` takes the pure `@comvi/core/rich-text` seam, which
passes the tag grammar per call and registers nothing.

### `.with(installer)` — composing a capability

`.with` is on every host and is a pipe, nothing more: `i18n.with(f)` **is**
`f(i18n)`. An **installer** is any `(host) => value`, so `attachLoader`,
`attachPlugins` and `attachDevtools` already are ones and `.with(attachLoader)`
works. `loader()`, `plugins()` and `devtools()` are the _configured_ installers:
`loader(importMap?)` also registers the map, `devtools(options?)` also takes
`instanceId` / `exposeGlobal`, `plugins()` takes no options yet.

```ts
const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));

// still supported — the low-level API the installers delegate to
const i18n2 = attachLoader(createI18n({ locale: "en" }));
i18n2.registerLoader(myLoader);
```

Composing a capability a host already has is a no-op — nothing is installed and
registered state is kept. Pick by what you have: `loader` names the import-map
adapter statically, so referencing it pulls that adapter in whether or not you
pass a map. With a map, use `loader(map)`; with a plain `LoaderFn`, use
`.with(attachLoader)` and register it yourself.

### `@comvi/react`, `@comvi/solid`, `@comvi/svelte`

Each publishes one entry carrying its bindings plus the toolkit, and `createI18n`
there is core's own constructor. Nothing about the providers, hooks, primitives,
stores or `<T>` changes — only the host underneath them, plus §2's renames.

```tsx
import { createI18n, I18nProvider, loader, useI18n } from "@comvi/react";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } }).with(
  loader({ uk: () => import("./uk.json") }),
);
// <I18nProvider i18n={i18n}>…</I18nProvider>, then useI18n() / useI18nLoader() inside.
```

Svelte sets context instead of rendering a provider:
`setI18nContext(createI18n({ … }))`, then `useI18n()` in any descendant. For
inline ICU catalogs add `compiler: icuCompiler` to the constructor call; for
remote ones import `icu` from the same entry and compose `.with(icu())` ahead of
the first catalog. Compose neither capability and `useI18nLoader()` /
`useI18nPlugins()` throw with the message in §8.

- **react** — `useI18nPlugins().onMissingKey` no longer coerces its callback's
  result with `String()`. It is the bound host method, so a callback may return
  the full `TranslationResult`, including the `Array<string | VirtualNode>` a
  rich-text fallback needs.
- **solid** — the two capability APIs are plain accessors, not signals: a
  capability action is an imperative operation, not a reactive value.
- **svelte** — they are **context readers**: callable during component
  initialisation only, returning plain bound functions; do not `$`-prefix a
  member. `<T>` now renders structurally, so `allowedTags` is **removed**
  (passing it is a type error), `components` accepts Svelte components, and the
  old implicit attribute rewriting (`rel="noopener noreferrer"`, forced `alt=""`,
  stripped `on*`) is gone — set those in your mapping props.
  `createLanguageStore` is removed; use `createLocaleStore`. `dist/*.js` now
  emits fully specified specifiers, so strict-ESM resolvers can import the
  package at all.

### `@comvi/vue`

```diff
-const i18n = createI18n({ locale: "en" }).use(FetchLoader({ … }));
+const i18n = createI18n({ locale: "en" });
+i18n.core.use(FetchLoader({ … }));
```

`VueI18n` is now `VueI18n<D, C extends WrapperI18nHost<D> = I18n<D>>` around an
injected host it exposes as `readonly core: C`, and its eight capability proxies
are gone: `addActiveNamespace`, `reloadTranslations`, `registerLoader`,
`registerLocaleDetector`, `registerPostProcessor`, `onMissingKey`, `onLoadError`
and `use`. `i18n.core.use(...)` returns the **host**, so it no longer chains off
the factory call.

Vue's preset is a real function — there is a `VueI18n` to construct, and
`ssrLocale` has to reach the host before the reactive ref is seeded — so all
three construction paths keep distinct names and ship from the one entry.
`createI18n(options)` keeps its 0.4.x call shape, `ssrLocale` and `compiler`
included. **The pipe goes on the host, one level down**: on `i18n.core`, or on
the value `createCore` handed you, which is what you want when the capability has
to be in place ahead of the first catalog.

```ts
import { createCore, createI18nFromCore, icu, loader } from "@comvi/vue";

const core = createCore({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
const i18n = createI18nFromCore(core, { ssrLocale: "en" }); // i18n.core is exactly `core`
```

The one-call preset ingests its `translation` immediately, so
`createI18n({ translation }).core.with(icu())` throws `E_COMPILER_LOCKED` by
construction — pass `compiler: icuCompiler` there instead. Vue's `<T>` also
gained a **default-slot fallback**: a key with no translation and no `fallback`
prop renders the default slot instead of the key.

## 5. Plugins

The three first-party plugin packages ship a lowercase **installer** each, next
to the uppercase factory they always had. The installer composes the capabilities
that plugin needs and then registers it — one call instead of three:

```ts
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(fetchLoader({ cdnUrl }));
await i18n.init();
```

| package                           | `.with(lowercase)`          | `.use(Uppercase)` — unchanged     |
| --------------------------------- | --------------------------- | --------------------------------- |
| `@comvi/plugin-fetch-loader`      | `fetchLoader(options)`      | `FetchLoader(options)`            |
| `@comvi/plugin-locale-detector`   | `localeDetector(options?)`  | `LocaleDetector(options?)`        |
| `@comvi/plugin-in-context-editor` | `inContextEditor(options?)` | `InContextEditorPlugin(options?)` |

Each composes, idempotently, what its plugin needs: `fetchLoader` →
`@comvi/core/loader` and `@comvi/core/plugins`; `localeDetector` →
`@comvi/core/plugins` only (it hands core a locale, it never loads a catalog);
`inContextEditor` → `@comvi/core/devtools` and `@comvi/core/plugins`, so an
editor-enabled host is visible to the extension without a separate
`.with(devtools())`.

The uppercase factories are unchanged, and the explicit recipe still works —
reach for it when you compose capabilities yourself or register plugins from a
list: `createI18n({ … }).with(loader()).with(plugins())`, then
`i18n.use(FetchLoader({ … }))`. Compose `loader()` as well when a plugin
registers one; their relative order does not matter (§0.1).

No lifecycle is duplicated: an installer's last act is `use`, so `required`,
`timeout`, `onError`, cleanup registration and LIFO destroy keep running inside
the plugin host. Two timing details — `fetchLoader` builds its plugin while it
composes, so a missing `cdnUrl` throws at COMPOSITION rather than at `init()`;
and `inContextEditor` returns the host type UNCHANGED, because under its
package's `production` export condition it is `(host) => host`. Compose
`.with(plugins())` when you want `use` yourself.

**Installers and plugins reject each other's slot.** Nothing is branded — `.with`
has no registry, ordering or dispatch — so the two are told apart by their
signatures. Both cross-uses are TYPE errors and both are loud at runtime:
`.use(fetchLoader(…))` throws at `init()` on the installer's first ensure-step,
before any capability is attached, naming the installer and the `.with` form;
`.with(FetchLoader(…))` calls the plugin against a host that has none of the
capabilities it needs, so the invocation is rejected. `ensureInstallable(host,
name)` is exported from `@comvi/core/plugins` for third-party installers.

**A plugin may only return nothing or a cleanup function** — a real break for
plugin authors, independent of installers. `init()` used to ignore any
non-function return and now throws on any non-`undefined` one, matching the
published `I18nPlugin` type. The shape that bites is the expression-bodied arrow:
`i18n.use(() => (ready = true))` returns `true`; write
`i18n.use(() => { ready = true; })`. It is also why `.use(inContextEditor())`
under `production` is caught — the identity no-op has no ensure-step to stop on,
so it returns the host and `init()` rejects that result.

`@comvi/plugin-fetch-loader` also takes an explicit **`baseUrl`** option
(precedence: `baseUrl` > legacy `apiBaseUrl` > build-time env overrides > the new
`comviPreset` export, which carries the vendor defaults). Defaults are preserved
when `baseUrl` is absent.

## 6. `@comvi/next`

The client inherits react's migration verbatim — `@comvi/next/client` re-exports
`useI18nLoader` / `useI18nPlugins` alongside `useI18n`.

**Three host entry points, and only one of them changed.** `createNextI18n` from
`@comvi/next` is preserved exactly: it composes ICU, ambient tags, the loader
with both `registerLoader` overloads, the plugin host, nested constructor
catalogs, default params and devtools discovery inside the package, so a 0.4 app
that calls it needs no migration at all; its host type is now published as
`NextComposedI18n<D>`. What changed is the DIRECT-host constructor on the two
runtime entries: `createI18n` on `@comvi/next/client` and `@comvi/next/server` is
the base host, row for row as §0 describes, and every installer that table names
is re-exported from both entries. The second constructor name that briefly stood
beside it during 0.5 development for the bare host is deleted; §3's rename table
has it, and the codemod does the rename.

A client host is hydrated, not loaded — nothing is ingested at construction, and
the catalog arrives through `<I18nProvider messages>`. So an inline catalog takes
`compiler: icuCompiler` in the same call, while a catalog that arrives LATER
(hydrated, or fetched by an SSR loader) takes the installer ahead of it:
`createI18n({ locale }).with(icu()).with(loader(map))`. Both `icu` and
`icuCompiler` ship from both entries, and `CompilerLockedError` types the failure.

The server gains a compose-it-yourself companion, exported from
`@comvi/next/server` and nowhere else — that entry carries the toolkit too,
because `NextServerHost = WrapperI18nHost & I18nLoaderApi` makes the loader
mandatory for SSR:

```ts
import "server-only";
import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () => createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") })),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

Its options are routing-only; everything else belongs to the host factory. The
result is exactly `{ i18n, routing }`, with no `.use*` methods, and `host()` is
resolved lazily — by the first `result.i18n` access or the first server helper
that needs the instance, exactly once, in either order. `@comvi/next/server`
deliberately exports no composed constructor and no tag entry.

**`setI18n` no longer replaces the instance.** A second call used to win, last
write wins. It now throws, in development and production, naming both sources:

```
[comvi/next] i18n already configured by createNextI18nFromHost(); setI18n() is a second source. Configure it once — only a same-instance setI18n() repeats.
```

Its public signature is unchanged and a repeat call with the **same** instance
stays a no-op (setup modules commonly re-run). Test suites that re-configured
between cases need a fresh cell: vitest and jest isolate module state per test
file, and in-repo suites use the `@internal` `_resetServerI18n()` from
`@comvi/next/dist/server/cache`.

**Plugin registration on `createNextI18n` is one method now.** `useClient`,
`useServer`, `useClientLazy` and `useServerLazy` are deprecated delegates; pass
`{ runtime, environment, lazy }` to `use()` instead.

**Locale routing** moved onto the shared `@comvi/locale-routing` package, with
two URL behaviour changes: a trailing slash survives locale-prefix stripping
(`/de/about/` → `/about/`, and the middleware no longer redirects to normalize
it), and interior duplicate slashes are no longer collapsed (`/de//x` → `//x`).
Prefix modes, the pathnames slug map and root-path handling are unchanged.

## 7. `@comvi/nuxt`

**The generated default host is the base host.** Nuxt's entries are unchanged and
`useI18n()`, `useI18nLoader()`, `useI18nPlugins()`, `<T>` and `<NuxtLinkLocale>`
are still auto-imported, so no import in your app moves. What moved is what the
module hands them: with `hostModule` unset it builds text + `{param}`
interpolation, the cache, events and default params, and nothing else. Two
escapes answer different questions.

**`comvi.icu: true`** is a module option (default `false`) that makes the
generated host use `icuCompiler`; it exists because that host has no `.with()`
seam of yours to compose on. With `hostModule` set it is ignored with a
build-time warning — a composed host picks its own compiler. ICU is never enabled
automatically.

**`hostModule`** is the composition escape, and the path for everything else:

```ts
// nuxt.config.ts
comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./comvi.host.ts" }
```

```ts
// comvi.host.ts — default-export a factory returning a FRESH host per call
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })
    .with(loader({ uk: () => import("./uk.json") }))
    .with(plugins())
    .with(devtools())) satisfies NuxtHostFactory;
```

Drop the lines you do not need — that is the point. Their order is free (§0.1),
and this factory is catalog-bearing, so it takes `compiler: icuCompiler` rather
than the `icu()` installer. The rest of the map: SSR / async loading →
`.with(loader(map))`; `comvi.setup` calling `i18n.core.use(...)` →
`.with(plugins())`; browser-extension visibility → `.with(devtools())`; `<tag>`
in plain `t()` → one `import "@comvi/core/tags"`; nested inline catalogs →
`flattenCatalog`, or `.with(loader())`, which flattens on ingestion.

**The factory receives nuxt's resolved options** — `locale` (the render locale on
the client, the request locale on the server), `fallbackLocale`, `defaultNs`,
`defaultParams`, `tagInterpolation` from `basicHtmlTags`, `devMode` and `apiKey`
— so a composed host honours the same `nuxt.config` an uncomposed one does. A
0.5.0-development factory that takes no argument keeps working.

**`NuxtServerHost` is the base host now**, not the loader-carrying shape it named
before; `NuxtServerLoaderHost` is the composed one, and it is what SSR
translation loading needs. The server utilities probe with core's `hasLoaderApi`
rather than trusting an annotation: on a host with no loader, `loadTranslations`
warns once naming `hostModule` and returns whatever the catalog already holds,
and `useTranslation` translates without touching a member that is not there.

`comvi.setup` hooks receive a `VueI18n`, so their proxy calls move to
`i18n.core.*`. `NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` are generic in the
host and default to core's `I18n` — annotate the hook with the host your factory
returns (`NuxtI18nSetup<I18n & I18nLoaderApi>`) and a call the host cannot serve
fails at type-check instead of at request time.

Nuxt's rendering layer is `@comvi/vue`, so vue's `<T>` change rides through:
rendering rich text no longer switches string-API tag parsing on behind your
back. And `comvi.host.ts` stays the one file in a nuxt app that names comvi
specifiers — the composition root the module branches on, so reading it tells you
exactly what the app pays for.

## 8. Errors you may now see

```
// development
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
// production
[comvi] missing loader capability — attach @comvi/core/loader
```

Thrown at the `useI18nLoader()` / `useI18nPlugins()` call, in both build
conditions, never silently.

| symptom                                                                       | fix                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `addActiveNamespace` / `reloadTranslations` / `onLoadError` is not a function | `useI18nLoader()`                                |
| `onMissingKey is not a function`                                              | `useI18nPlugins()`                               |
| vue: `i18n.registerLoader` / `i18n.use` is not a function                     | `i18n.core.*`                                    |
| vue: `i18n.core.reloadTranslations` will not type-check                       | host-typed by design — use `useI18nLoader()`     |
| `E_INSTALLER_NESTED_USE`                                                      | you wrote `.use(installer(…))`; write `.with(…)` |
| `E_PLUGIN_INIT_RETURN`                                                        | a plugin returned a value — use a statement body |
| `E_COMPILER_LOCKED`                                                           | `icu()` after a catalog — §0.1                   |

One more silent change worth naming: **escapes travel with the grammar they
escape.** `&lt;`, `&gt;`, `&amp;` and `\<` exist to write a literal angle bracket
inside a message that IS tag syntax, so on a host with no tag extension they are
ordinary characters and stay in the output. Any tag extension brings them back —
`import "@comvi/core/tags"`, or `tagInterpolation.extensions` per call. **ICU
apostrophe quoting is unaffected**: `'{literal}'` and `''` are core grammar and
still work everywhere.

---

Engineers who want the long form — measured byte tables, fixture and gate names,
and the reasoning behind each decision — will find it in this file's git history.
