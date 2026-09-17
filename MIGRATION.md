# Migrating to comvi 0.5.0 — one entry per package

You are upgrading from **0.4.x**. 0.5.x was never published, so 0.4 is the
version you are on. Two things changed, and the first is a **breaking change to
published API** riding the pre-1.0 minor-bump policy:

0. **`@comvi/core` is now ONE entry, the base host.** A capability is an import
   you add, never an entry you switch. §0 covers it in full.
1. Every framework binding runs on that host, which moved four loader/plugin
   members out of `useI18n()` (§1 onwards). That part is mechanical.

The upgrade itself, in order:

1. Update every `@comvi/*` package you depend on to `0.5.0`.
2. Rename the hook destructures. §2 tables every name that moved, and the two
   names it moves them to — `useI18nLoader` and `useI18nPlugins` — are what one
   grep finds every call site of.
3. Compose back the capabilities your app used. §0's table has one row per thing
   the 0.4 root did for you.
4. Work through the per-binding section your app needs (§3 onwards), then the
   errors in §7 that your first run produces.

---

## 0. The root entry changed semantics

The 0.4 root carried everything. The converged root is the **base host**: text
with `{param}` interpolation, the cache, events, default params and `.use()`.
Everything in the left column below used to be there whether you used it or not.
In 0.5 each is absent until composed, and absent means _its module never entered
your bundle_.

| 0.4 root behaviour                                  | converged root                                                             | migration                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| ICU plurals / select                                | dev throws, prod renders it literally                                      | `compiler: icuCompiler` in the constructor options |
| 0.4's `.use(plugin)`                                | absent: TS error plus `TypeError`                                          | `.use(definePlugin(p))`, or a bare-name installer  |
| loader (`registerLoader`, …)                        | absent: the loud capability error                                          | `.use(attachLoader)`, or `fetchLoader(opts)`       |
| discovery (`instanceId`, `window.__COMVI__`)        | absent: invisible to the extension                                         | `.use(devtools())`, or `inContextEditor()`         |
| a bare `loader()` (0.5 pre-release, attach-only)    | TS error: the import map is required                                       | `.use(attachLoader)`                               |
| string-API tags (`"<b>hi</b>"`)                     | literal text, dev warning                                                  | `<T>`, or `import "@comvi/core/tags"`              |
| a plugin returning a value                          | throws at `init()`                                                         | return nothing, or a cleanup function              |
| `clearTranslations(undefined, ns)` deactivated `ns` | clears CONTENT only, in every form                                         | `removeActiveNamespace(ns)` from the loader        |
| nested inline catalogs                              | unchanged: every host flattens them                                        | —                                                  |
| `new I18n(options)`                                 | unchanged, one argument                                                    | —                                                  |
| the CDN global (`<script src>`)                     | unchanged, still fully composed                                            | —                                                  |
| `createNextI18n`                                    | composes tags, the loader, plugins and devtools; the COMPILER is now yours | `compiler: icuCompiler` for an ICU catalog         |

A **missing interpolation parameter now renders as the literal placeholder.** In
0.4, `t("greet")` on `"Hello, {name}!"` gave `"Hello, !"`; in 0.5 it gives
`"Hello, {name}!"`, plus one dev warning per (template, parameter). An explicit
`null` still renders as an empty string. Opt out with `missingParam: "drop"`.

### 0.1 The compiler is a constructor option

If your 0.4 catalogs contain ICU (`{count, plural, …}`, `{gender, select, …}`),
the root no longer compiles them for you. Name the compiler. The option
`compiler: icuCompiler` is a plain field held for the instance's life, so one
option covers every catalog source: inline, an `addTranslations` call, a loader
merge, the CDN, the API.

```ts
// INLINE catalogs.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

const translation = { en: { items: "{count, plural, one {# item} other {# items}}" } };

const i18n = createI18n({ locale: "en", translation, compiler: icuCompiler });
```

```ts
// REMOTE catalogs — the same option, in the same place.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);
```

A tree written against a 0.5 pre-release may still compose the removed `icu`
installer. Delete that call and name the compiler in the constructor options
instead: the installer is gone, and no `.use(…)` composes ICU.

Composition carries no ordering rule at all: the loader, `plugins()` and
`devtools()` may go in any order among themselves, and all three only have to be
composed before `init()`.

Ingestion is a deep check rather than a scan of the top level. The development
preflight walks every `plural` / `select` branch and every tag's children, so an
argument the compiler cannot compile fails **where its catalog entered** rather
than at the first `t()` inside a component. Composing or registering after
`init()` warns once per host in development; production is unchanged.

### 0.2 The ICU failure, and how to report it

In **0.4** an ICU template on the root rendered as a plural. In **0.5**, under
the default compiler, it never does: **development throws at ingestion** and
**production renders the braced segment literally**, reporting `E_ICU_SYNTAX`
through `onError` (or `console.error` when no handler is configured). The two
builds differ here.

The development throw lands where the template is compiled, so a catalog string
throws where it entered, and one that never passes through ingestion (a per-call
`params.fallback`) throws at its first compile. Where it entered also decides
what your app SEES: an inline catalog rethrows out of the constructor or the
`addTranslations` call, while a catalog arriving over a loader fails that
namespace's load instead — `E_ICU_SYNTAX` reaches `onLoadError`, and `init()`
rejects with `[i18n] Failed to load all namespaces …` when that was the only
namespace. The production report is best-effort: it fires on the compilation
that hit it, at most one per `t()` call, so a cached render never re-reports and
a compile made outside the host is dropped.

Two cases fail the same way even **with** the ICU compiler named. The first is
an argument whose type is not `plural`, `selectordinal` or `select`
(`{price, number}`, `{d, date}`, `{t, time}`), which is not on the roadmap:

```
[i18n] ICU argument `{price, number}` is not supported: this compiler implements `plural`, `selectordinal` and `select`, each with a choice list like `other {…}`. Quote the braces ('{'…'}') or format the value in code and pass it as a plain {param}
```

Format the value in code and pass the result as a plain `{param}`, or quote the
braces to keep the text literal. The second is a choice list whose selectors are
missing their braced sub-messages, which is where the plural `offset:` form
lands too (not implemented either):

```
[i18n] The `plural` choice list `one {# item} other` is malformed; every selector needs a braced sub-message, as in `other {…}`
```

Give every selector a `{…}` sub-message. Both messages are development-only text
and fold out of production, where the braced segment renders literally and is
reported.

`E_ICU_SYNTAX` carries `code` and `argumentType` and nothing else. The
`argumentType` names the argument type the message used: `"plural"`, `"select"`
or `"selectordinal"`, or the parsed token such as `"number"` / `"date"` /
`"other"` for a type this compiler does not implement. Locale, namespace, key
and catalog source reach your handler through the report context:

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  onError(error, context) {
    // context: { source: "compile", key, namespace, locale }
    if ((error as { code?: string }).code === "E_ICU_SYNTAX") console.error(error, context);
  },
});
```

### 0.3 Bundle-wide changes

Three things that are not in any table, because they are properties of the
_bundle_ rather than of one call:

- **String-API tags without a tag extension render literally** (dev warns). The
  fix, `import "@comvi/core/tags"`, registers the grammar **process-wide and
  retroactively**. It is a property of the bundle, not of one host, so every
  instance in the graph, including already-built ones, starts parsing tags, and
  there is no per-instance opt-out. SSR apps must import it in the **server**
  graph too, or a string renders literally on the server and with markup on the
  client. `<T>` needs none of this: it goes through `@comvi/core/rich-text`,
  which passes the tag grammar per call and registers nothing.
- **Discovery is opt-in.** An app on the base host is invisible to the browser
  extension until it composes `devtools()` or the in-context-editor installer.
  The extension must be **0.5.0 or newer**: `window.__COMVI__` is protocol v2 (a
  queue the consumer drains and hooks), and an old extension with new core is
  the one unsupported pairing. The 0.4 `COMVI_READY` event is **gone**: core
  dispatches it nowhere in 0.5, so anything still listening for it (a custom
  devtools panel, a page script waiting for i18n) must read the
  `window.__COMVI__` queue instead.
- **Reflective consumers**: `instanceId` is absent unless discovery is installed,
  and the loader/plugin members are no longer on the prototype chain.
  `@comvi/core` is also compiled with `useDefineForClassFields: false`, so a
  declared-but-unassigned field is not an own property and own-property order is
  assignment order. On an instance that did not expose itself, `Object.keys()`
  and `{ ...i18n }` no longer list `instanceId`, though `i18n.instanceId` still
  reads `undefined`. Every public method and accessor is still a non-enumerable
  prototype member with unchanged descriptors.

## 1. Why the hooks moved

`useI18n()` used to hand you `addActiveNamespace`, `reloadTranslations`,
`onLoadError` and `onMissingKey`. Those belong to the `@comvi/core/loader` and
`@comvi/core/plugins` capabilities rather than to the translation core, so the
hook's return type promised methods a base host does not have. Svelte crashed
outright, solid deferred the crash to the call site, and react and vue typed them
present and failed later. In 0.5.0 the four members are gone from the common
hook's return, in types and at runtime, so the return type now tells the truth
about what a base host has: reaching for a capability you never composed is a
type error rather than a runtime surprise. You acquire the four explicitly
instead, and a host without the capability fails at that one call, with a message
naming the fix.

Each of the four is still DECLARED on `useI18n()`'s return type, as a
`@deprecated` member typed `never`, so a 0.4 destructure fails with the
acquisition in the tooltip (`const { reloadTranslations } = useI18nLoader()`)
rather than a bare "Property does not exist"; nothing is added at runtime.

Those declarations are **optional**, which has one consequence worth stating
because a compiler will not: `if (bag.reloadTranslations)` compiles and is
always false. Acquire the member from `useI18nLoader()` instead of testing for
it. All four declarations are removed in 0.6.
**Vue's `useI18n()` additionally drops `hasTranslationNow` / `hasLocaleNow`** —
`hasTranslation` and `hasLocale` are already the non-reactive form in the other
three bindings — and the pair stays on the `VueI18n` class, reachable as
`inject(I18N_INJECTION_KEY)!.hasTranslationNow(...)`.

## 2. The migration table

| 0.4.x                                                               | 0.5.0                                                                                                                                                       |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `const { reloadTranslations, … } = useI18n()`                       | `const { reloadTranslations, addActiveNamespaces, … } = useI18nLoader()`                                                                                    |
| `const { onMissingKey } = useI18n()`                                | `const { onMissingKey } = useI18nPlugins()`                                                                                                                 |
| `useI18n("ns")` for a capability member                             | `useI18n("ns")` keeps `t`; the capability APIs take no argument                                                                                             |
| vue `i18n.registerLoader(…)`, 0.4's `.use(…)`, six more             | `i18n.core.*` once the capability is composed on the `createI18n` result: `.use(attachLoader)` for `registerLoader`, `.use(plugins())` for `registerPlugin` |
| vue `new VueI18n(options)`                                          | `createI18n(options)`; the constructor takes `(core, vueOptions)`                                                                                           |
| react/solid/svelte/vue `new I18n(options)` (root `I18n` as a value) | `createI18n(options)`; `I18n` is a TYPE-only export on all four binding roots now — import the class itself from `@comvi/core` if you need it directly      |
| svelte/solid `getI18nContext().reloadTranslations()`                | `useI18nLoader()` in a component, or hold your own host                                                                                                     |
| nuxt `comvi.setup` calling a dropped `VueI18n` proxy                | `context.core.*`                                                                                                                                            |
| next: a second `setI18n(other)`                                     | one configuration source per process; see §5                                                                                                                |

`useI18nLoader()` and `useI18nPlugins()` ship from every binding
(`@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`,
`@comvi/next/client`; auto-imported in `@comvi/nuxt`) under those names, so one
grep finds every call site. Neither takes a namespace argument, and the bag they
return is referentially stable per host instance.

## 3. Per binding

### One package per app

A host used to take two packages: the constructor from `@comvi/core`, the
bindings from `@comvi/<framework>`. Each framework package now carries the base
constructor and the capability toolkit on the ONE entry it publishes.

| binding         | specifier                                  | host constructor                                                                                                                   |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@comvi/react`  | `@comvi/react`                             | `createI18n`                                                                                                                       |
| `@comvi/solid`  | `@comvi/solid`                             | `createI18n`                                                                                                                       |
| `@comvi/svelte` | `@comvi/svelte`                            | `createI18n`                                                                                                                       |
| `@comvi/vue`    | `@comvi/vue`                               | `createI18n`, plus `.use(…)` on its result; `createI18nFromCore` wraps a host built elsewhere with `createI18n` from `@comvi/core` |
| `@comvi/next`   | `@comvi/next/client`, `@comvi/next/server` | `createI18n`; see §5                                                                                                               |
| `@comvi/nuxt`   | auto-imported                              | generated, or `hostModule`; see §6                                                                                                 |

Next's two entries are a RUNTIME split, not a host-tier split: both publish the
same base constructor and the same toolkit. Six capability bindings are
re-exported **by name** on each entry (`icuCompiler`, `loader`, `attachLoader`,
`plugins`, `definePlugin`, `devtools`), so the ICU compiler is reachable from
the one import an app already has, and the bindings you never call are pruned
by your bundler. `client`/`server` expose `createI18n` like every other
binding root, plus only the type-level surface they each need; the base
`I18n` class VALUE and core's full type vocabulary (`export type * from
"@comvi/core"`) live on the `@comvi/next` root only — `new I18n(…)` needs the
root specifier, not `client` or `server`.
`@comvi/nuxt` is the one exception and re-exports nothing (§6). `createI18n` IS
core's own constructor everywhere but `@comvi/vue`, whose `createI18n` builds
the `VueI18n` preset around it.

The same two names dropped off every binding entry — `@comvi/react`,
`@comvi/solid`, `@comvi/svelte`, `@comvi/vue`, the `@comvi/next`
root/`client`/`server` trio and `@comvi/nuxt/host` — for the same reason:
`attachPlugins` and `attachDevtools` are the low-level installers `plugins()`
and `devtools()` already configure, so a binding user reaches for those two
instead. `attachLoader` stays on all of them: it is not a synonym of
`loader(map)` but the attach-only loader installer.
Coming from a 0.5-pre build where a binding root still exported the pair,
import it from `@comvi/core/plugins` / `@comvi/core/devtools` instead:

```diff check=skip:core-subpath-migration
-import { attachPlugins, attachDevtools } from "@comvi/react";
+import { attachPlugins } from "@comvi/core/plugins";
+import { attachDevtools } from "@comvi/core/devtools";
```

**Every 0.4.x import path still resolves** — the SPECIFIER, that is. What
changed is the HOST those entries construct, not the module you name. Two
kinds of 0.4.x _named import_ can stop resolving. First, a runtime `import {
I18n } from` any of `@comvi/react`, `@comvi/solid`, `@comvi/svelte` or
`@comvi/vue` (`new I18n(…)`, `instanceof I18n`, …): `I18n` is now a TYPE-only
export on all four roots — see the migration table in §2, or import the class
from `@comvi/core`. Second, `@comvi/vue` specifically, which used to
carry `export * from "@comvi/core"` and now re-exports core's values by name;
the ten OTHER names that dropped out, and where each one moved, are tabled in
the `@comvi/vue` subsection below. And since no package publishes a
second copy of a binding, the old entry-mixing hazard is gone: `@comvi/react`,
`@comvi/solid`, `@comvi/svelte` and `@comvi/vue` ship theirs from one entry each,
`@comvi/next` splits its two runtime entries by runtime rather than by tier, and
`@comvi/nuxt` auto-imports. No import path can put a second copy of a binding in
your graph, so a provider and a hook in one app always see each other.

`@comvi/core/tags` is **not** re-exported by any binding: importing it registers
tag syntax ambiently, a side effect no framework entry should hand you by
accident. Every `<T>` goes through `@comvi/core/rich-text` instead, which passes
the tag grammar per call and registers nothing.

### Renames

The first table lands on a genuine 0.4 tree. The second exists only for a tree
written against a 0.5 pre-release, because 0.4 published none of those names.
Each row is one grep, and each edit is by hand.

| 0.4.x                                                    | 0.5.0                                  |
| -------------------------------------------------------- | -------------------------------------- |
| `exposeGlobal` / `instanceId` in the constructor options | both move into `.use(devtools({ … }))` |
| `flattenCatalog` from a binding root or `/loader`        | the same name, from `@comvi/core`      |
| `FetchLoader(options)`                                   | `fetchLoaderPlugin(options)`           |
| `CdnLoader(options)`                                     | `cdnLoaderPlugin(options)`             |
| `LocaleDetector(options?)`                               | `localeDetectorPlugin(options?)`       |
| `InContextEditorPlugin(options?)`                        | `inContextEditorPlugin(options?)`      |
| `useTranslation(event, { namespace })` on nuxt's server  | `{ ns }` — `namespace` warns until 0.6 |

The four raw plugin factories — the ones you hand to `registerPlugin` — are
renamed because they used to differ from their installers by letter case alone:
`fetchLoader` composed and registered, `FetchLoader` built a plugin, and one
mistyped capital silently changed what your chain did. The `Plugin` suffix says
which is which, and the installers (`fetchLoader`, `cdnLoader`,
`localeDetector`, `inContextEditor`) keep their names. `window.ComviInContextEditor`
on the standalone editor bundle exposes the factory under the new name too.

The last row is the one rename with a deprecation window rather than a hard
break. `ns` is what core's `t(key, { ns })` and `@comvi/next`'s `getI18n({ ns })`
already called it, so nuxt's server helper was the only place in the library
spelling the same idea `namespace`. Passing `namespace` keeps working for all of
0.5 and warns once in dev; passing both takes `ns`.

| 0.5 pre-release                                                | 0.5.0                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `@comvi/<pkg>/slim`, on react, solid, svelte, vue, next client | `@comvi/<pkg>`: one entry per package, and it is the base host |
| `@comvi/core/slim`                                             | `@comvi/core`                                                  |
| `createSlimI18n`                                               | `createI18n`, at the import and at every reference and alias   |
| a `.with` call, anywhere in a chain                            | `.use`, the one composition verb, with no alias left behind    |

A **chain** is the unit for all of this: `createI18n(…)` plus the `.use` calls
chained onto it. A capability is acquired per chain, never per file, so a host
built in one module composes nothing for a host built in another.

### `.use(installer)` — composing a capability

`.use` is on every host and is a pipe: `i18n.use(f)` **is** `f(i18n)`. An
**installer** is any `(host) => value`, so `attachLoader`, `attachPlugins` and
`attachDevtools` already are ones and `.use(attachLoader)` works. `loader(map)`,
`plugins()` and `devtools()` are the _configured_ installers: `loader(importMap)`
also registers the map — and REQUIRES it, so `attachLoader` is the one
attach-only loader installer — `devtools(options?)` also takes `instanceId` /
`exposeGlobal`, `plugins()` takes no options yet. `definePlugin(fn, options?)`
is the one for a plugin of your own: it composes the plugin host and registers
`fn`, so an app's inline plugin stays in the chain as `.use(definePlugin(fn))`.

```ts
import { createI18n } from "@comvi/core";
import { attachLoader, loader, type LoaderFn } from "@comvi/core/loader";

const i18n = createI18n({ locale: "en" }).use(loader({ uk: () => import("./uk.json") }));

const myLoader: LoaderFn = async (locale, namespace) =>
  (await fetch(`/i18n/${locale}/${namespace}.json`)).json();

// still supported — the low-level API the installers delegate to
const i18n2 = attachLoader(createI18n({ locale: "en" }));
i18n2.registerLoader(myLoader);
```

Composing a capability a host already has is a no-op: nothing is installed and
registered state is kept.

Pick by what you have. `loader` names the import-map adapter statically, so
referencing it pulls that adapter in whether or not you pass a map. With a map,
use `loader(map)`. With a plain `LoaderFn`, use `.use(attachLoader)` and register
it yourself. **`registerLoader` takes a function**, not a map, on every host but
the two fully composed ones: the overload lives on core's `full` host, which the
CDN/UMD global publishes; `createNextI18n` builds on the base host and restores
the same overload on its own composed host. Neither the overload nor the compiler
travels with the other — next takes the map form and no compiler.

### `@comvi/react`, `@comvi/solid`, `@comvi/svelte`

Each publishes one entry carrying its bindings plus the toolkit, and `createI18n`
there is core's own constructor. Nothing about the providers, hooks or stores
changes. Two things did, both additive: `<T>`'s `raw` prop is renamed to
`skipPostProcess` (`raw` still works — deprecated, for one release, with a
one-time dev warning); and solid and svelte each gain
the one per-axis primitive the other already had — solid's
`createDefaultParamsSignal` and svelte's `createDefaultNamespaceStore`.

Solid's primitives follow one naming rule: **`create*Signal` reads** (an
`Accessor` mirroring the host, on all seven axes) and **`create*State` reads and
writes** (`[accessor, setter]`, the setter writing through to the host), so the
two writable axes are `createDefaultNamespaceState` and
`createDefaultParamsState`. Svelte keeps stores as its write path:
`createDefaultNamespaceStore` and `createDefaultParamsStore` are `Writable`, and
their `set` / `update` call `setDefaultNamespace` / `setDefaultParams`.
Otherwise only the host underneath them changes, plus the renames in §2.

```tsx
import { createI18n, I18nProvider, loader, useI18n } from "@comvi/react";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } }).use(
  loader({ uk: () => import("./uk.json") }),
);
// <I18nProvider i18n={i18n}>…</I18nProvider>, then useI18n() / useI18nLoader() inside.
```

Svelte sets context instead of rendering a provider:
`setI18nContext(createI18n({ … }))`, then `useI18n()` in any descendant. For
ICU catalogs add `compiler: icuCompiler` to the constructor call, whether the
catalogs are inline or loaded. Compose neither capability and `useI18nLoader()` /
`useI18nPlugins()` throw with the message in §7.

- **React:** `useI18nPlugins().onMissingKey` no longer coerces its callback's
  result with `String()`. It is the bound host method, so a callback may return
  the full `TranslationResult`, including the `Array<string | VirtualNode>` a
  rich-text fallback needs.
- **Solid:** the two capability APIs are plain accessors, not signals. A
  capability action is something you call, not a value you read.
- **Svelte:** they are **context readers**: callable during component
  initialisation only, returning plain bound functions; do not `$`-prefix a
  member. `<T>` now renders structurally, so `allowedTags` is **gone**, and
  leaving it in place is a type error (`allowedTags?: never` on `TBaseProps`, which `TProps`
  intersects), while
  a JS caller that still passes it gets a one-time development warning and the
  value is dropped rather than spread into `params`. Delete it. `components`
  accepts Svelte components, and the old implicit
  attribute rewriting (`rel="noopener noreferrer"`, forced `alt=""`, stripped
  `on*`) is gone; set those in your mapping props. `createLanguageStore` is
  removed; use `createLocaleStore`. `dist/*.js` now emits fully specified
  specifiers, so strict-ESM resolvers can import the package at all. The
  **peer range narrows from `svelte: ^5.0.0` to `^5.3.0`** — `<T>` wraps each
  tag handler in `<svelte:boundary>`, added in Svelte 5.3, so 5.0–5.2 gets a
  peer warning at install and a compile error after it (changeset
  `svelte-t-handler-error-path`); every 5.x from 5.3 on satisfies it.

Two provider props are new in 0.5 and purely additive, so there is nothing to
migrate: react's and solid's `<I18nProvider>` accept a `fallback`, rendered
instead of the children until the host is initialized — the `isInitialized`
axis, so no frame paints raw keys, and with `autoInit: false` the gate holds
until you call `init()`; solid's accepts `ssrLocale`, the render locale for
`renderToString` and hydration, spelled the way `@comvi/vue` and `@comvi/nuxt`
spell it. Solid adopts it by WRITING `i18n.locale` during the render phase, so
an SSR app has to build the host inside the request handler: a module-scope
host shared by every concurrent request would carry one request's locale into
another's tree (the solid README's SSR section has the per-request shape).
React accepts `ssrLocale` too, and it is the canonical name there as well:
its own `ssrInitialLocale` is the deprecated alias, and `ssrLocale` wins when
both are passed.
Svelte has no provider component and needs neither: gate the first paint on the
`$isInitializing` store from `useI18n()`, and seed the render locale on the
per-request host you build in `+layout.svelte` (§SSR in its README).

### `@comvi/vue`

```diff check=skip:proxy-relocation
-const i18n = createI18n({ locale: "en" }).use(fetchLoaderPlugin({ … }));
+const i18n = createI18n({ locale: "en" }).use(fetchLoader({ … }));
```

`VueI18n` is now `VueI18n<D, C extends WrapperI18nHost<D> = I18n<D>>` around an
injected host it exposes as `readonly core: C`, and its eight capability proxies
are gone: `addActiveNamespace`, `reloadTranslations`, `registerLoader`,
`registerLocaleDetector`, `registerPostProcessor`, `onMissingKey`, `onLoadError`
and 0.4's `use(plugin)`. Plugin registration did **not** move to `i18n.core`
under that name: it belongs to `@comvi/core/plugins` and is called
`registerPlugin` there, so it is on a host only after `.use(plugins())`, and the
base host `createI18n` builds has no `registerPlugin` at all:
`i18n.core.registerPlugin(…)` is a type error and a `TypeError` at runtime.
Compose the capability with `.use(plugins())`, then call
`i18n.core.registerPlugin(…)`. The bare-name installer is the shorter road,
because it composes what the plugin needs itself, and `.use(definePlugin(fn))`
is the shorter road for a plugin of your own. The `use` that `VueI18n` has today
is the composition pipe, not the proxy that went away.

Vue's preset is a real function: there is a `VueI18n` to construct, and
`ssrLocale` has to reach the host before the reactive ref is seeded. So all three
construction paths keep distinct names and ship from the one entry.
`createI18n(options)` keeps its 0.4.x signature, `ssrLocale` and `compiler`
included. **The pipe goes on its result**: `const i18n =
createI18n(options).use(installer)` runs the installer on `i18n.core`, hands
back the same `VueI18n`, and widens the type of `core` by what the installer
composed, so the capability is in place and stays typed afterwards. ICU is not
composed at all: it is `compiler: icuCompiler` in the options, beside
`ssrLocale`. Assign the result: a discarded `i18n.use(…)` still attaches the
capability at runtime but leaves the binding's `core` unwidened. Compose before
`app.use(i18n)`, which starts `init()` — the one thing that drains the plugin
queue. Compose after it and the plugin waits for the next `init()`, which is
almost never what you meant; the dev build warns.
`createI18nFromCore` (wrapping a host you built yourself, with `createI18n` from
`@comvi/core`; the `createCore` alias is gone) is unchanged and advanced:
it is for a host built elsewhere, such as Nuxt's `hostModule` (§6) or one host
shared between a Vue app and non-Vue code. `.use(…)` works on a
`createI18nFromCore` result too.

```ts
import { createI18n, icuCompiler, loader } from "@comvi/vue";

const i18n = createI18n({ locale: "en", ssrLocale: "en", compiler: icuCompiler }).use(
  loader({ uk: () => import("./uk.json") }),
);
i18n.core.reloadTranslations(); // typed: `.use` widened `core`
```

Vue's `<T>` also gained a **default-slot fallback**: a key with no translation
and no `fallback` prop renders the default slot instead of the key. Its `raw`
prop is renamed to `skipPostProcess`, the same rename every binding's `<T>`
gets. A Vue template's `<T raw>` has to be edited by hand — `raw` still works,
deprecated, for one release, with a one-time dev warning.

**Ten named value exports dropped.** `@comvi/vue` used to re-export core with
`export * from "@comvi/core"`, so every value on core's root entry, except
`createI18n` (vue shadowed it with its own), was also a named export of
`@comvi/vue`. The entry now re-exports core's values **by
name** and its types with `export type *`, because a star re-export of values
is a name set webpack can only resolve by keeping the source module alive
(§0.3's bundle notes). The types are unaffected —
`import type { TranslationCache } from "@comvi/vue"` still resolves — but these
ten **values** no longer do, and the failure is a bundler or ESM "no such
export" at build time, not a runtime `undefined`:

| 0.4.x `import { … } from "@comvi/vue"`                                 | 0.5.0                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime`   | `useI18n()` returns all four, already bound to the reactive locale; unbound, `@comvi/core`              |
| `getTextDirection`                                                     | `useI18n().dir` for the current locale; the helper itself, `@comvi/core`                                |
| `TranslationCache`                                                     | `useI18n().translationCache` for the read-only snapshot; the class, `@comvi/core`                       |
| `createBoundTranslation`, `translationResultToString`, `createElement` | `@comvi/core`                                                                                           |
| `flattenCatalog`                                                       | nothing, in almost every case: every host flattens a nested catalog itself. The function, `@comvi/core` |
| `I18n` (the class, as a value)                                         | `createI18n(options)`, or import the class from `@comvi/core`                                           |

Every one of the ten `export * from "@comvi/core"` names above the last row
is still exported by `@comvi/core`, which `@comvi/vue` depends on, so the fix
is a one-line import move and nothing was actually removed from the library.
Prefer the `useI18n()` members where the table offers them: those track the
locale, where the bare helpers take it as an argument. The last row, `I18n`,
is a SEPARATE, shared change: it dropped from all four binding roots alike
(§2's migration table), not from `@comvi/vue`'s `export * from "@comvi/core"`
going away — `@comvi/react`, `@comvi/solid` and `@comvi/svelte` are not
affected by the ten-name drop above (they already used `export type *` in
0.4.x, so the rest of their value surface only grew), but lost `I18n` as a
value too.

## 4. Plugins

The three first-party plugin packages ship an **installer** each, next to the
raw plugin factory. The installer composes the capabilities
that plugin needs and then registers it, in one call instead of three:

```ts
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({
  locale: "en",
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
await i18n.init();
```

| package                           | `.use(installer)`           | `registerPlugin(factory)`         |
| --------------------------------- | --------------------------- | --------------------------------- |
| `@comvi/plugin-fetch-loader`      | `fetchLoader(options)`      | `fetchLoaderPlugin(options)`      |
| `@comvi/plugin-fetch-loader/cdn`  | `cdnLoader(options)`        | `cdnLoaderPlugin(options)`        |
| `@comvi/plugin-locale-detector`   | `localeDetector(options?)`  | `localeDetectorPlugin(options?)`  |
| `@comvi/plugin-in-context-editor` | `inContextEditor(options?)` | `inContextEditorPlugin(options?)` |

New in 0.5.0: `@comvi/plugin-fetch-loader/cdn` is the CDN request path on its
own. `fetchLoader` picks between the CDN and the API at runtime, so it carries
both; an app that only reads a public distribution swaps it for `cdnLoader` and
drops the API request path with it:

| graph                                  | fixture                        | min+gz  |
| -------------------------------------- | ------------------------------ | ------- |
| base host, ICU, and the root entry     | `plugin-fetch-loader-cdn`      | 11139 B |
| base host, ICU, and the `/cdn` subpath | `plugin-fetch-loader-cdn-lite` | 9173 B  |

Keep `fetchLoader` wherever the host has an `apiKey`.

Each composes, idempotently, what its plugin needs: `fetchLoader` →
`@comvi/core/loader` and `@comvi/core/plugins`; `localeDetector` →
`@comvi/core/plugins` only (it hands core a locale, it never loads a catalog);
`inContextEditor` → `@comvi/core/devtools` and `@comvi/core/plugins`, so an
editor-enabled host is visible to the extension without a separate
`.use(devtools())`.

The factories are RENAMED (see §3's Renames table) and otherwise unchanged, and
the explicit recipe still works. Use it when you compose capabilities yourself
or register plugins from a list:
`createI18n({ … }).use(attachLoader).use(plugins())`, then
`i18n.registerPlugin(fetchLoaderPlugin({ … }))`. Compose the loader as well when a
plugin registers one; their relative order does not matter (§0.1).

No lifecycle is duplicated: an installer's last act is `registerPlugin`, so
`required`, `timeout`, `onError`, cleanup registration and LIFO destroy keep
running inside the plugin host. `fetchLoader` builds its plugin while it
composes, so a missing `cdnUrl` throws at COMPOSITION rather than at `init()`.
`inContextEditor` returns the host type UNCHANGED, because under its package's
`production` export condition it is `(host) => host`. Compose `.use(plugins())`
when you want `registerPlugin` yourself.

**Installers and plugins reject each other's slot.** Neither is branded, and
`.use` has no registry, ordering or dispatch, so the two are told apart by their
signatures and, at runtime, by identity: an installer widens the host in place
and hands that same host back, and `.use` refuses any other return value,
whatever its shape. Both cross-uses are TYPE errors and both fail at runtime:
`registerPlugin(fetchLoader(…))` throws `E_INSTALLER_AS_PLUGIN` at `init()` on
the installer's first ensure-step, before any capability is attached, naming the
installer and the `.use` form; `.use(fetchLoaderPlugin(…))` runs the plugin against a
host that has none of the capabilities it needs, so the invocation is rejected,
and on a host that has them `.use` still throws `E_USE_NOT_INSTALLER`, since a
plugin never hands the host back. `.use` calls the function before it checks, so
an async plugin put there returns a promise nobody awaits; the queue, through
`registerPlugin` or `definePlugin(fn)`, is what gives a plugin `required`,
`timeout`, `onError` and cleanup. `ensureInstallable(host, name)` is exported
from `@comvi/core/plugins` for third-party installers.

**A plugin may only return nothing or a cleanup function.** That is a real break
for plugin authors, independent of installers. In 0.4, `init()` ignored any
non-function return; in 0.5 it throws on any non-`undefined` one, matching the
published `I18nPlugin` type. The cause is one of two, and the development message
names both. An expression-bodied arrow:
`.use(definePlugin(() => (ready = true)))` returns `true`; write
`.use(definePlugin(() => { ready = true; }))`. Or a bare-name installer handed
to `registerPlugin()`, the case that catches `registerPlugin(inContextEditor())`
under `production`: the identity no-op has no ensure-step to stop on, so it
returns the host and `init()` rejects that result.

`@comvi/plugin-fetch-loader` also takes an explicit **`baseUrl`** option
(precedence: `baseUrl` > legacy `apiBaseUrl` > build-time env overrides > the new
`comviPreset` export, which carries the vendor defaults). Defaults are preserved
when `baseUrl` is absent.

## 5. `@comvi/next`

The client inherits react's migration verbatim: `@comvi/next/client` re-exports
`useI18nLoader` / `useI18nPlugins` alongside `useI18n`.

**Three host entry points, and the composed root changed in exactly one way.**
`createNextI18n` from `@comvi/next` still composes ambient tags, the loader with
both `registerLoader` overloads, the plugin host, default params and devtools
discovery inside the package, and its host type is now published as
`NextComposedI18n<D>`. What it no longer does is pick a compiler: it used to
default `compiler` to `icuCompiler`, and now it defaults nothing, so **a 0.4 app
that rendered plurals through `createNextI18n` must add
`compiler: icuCompiler`** — the same one line every other constructor in the
repo asks for. Nothing else about the factory needs migrating. What changed
beyond it is the DIRECT-host constructor on the two
runtime entries: `createI18n` on `@comvi/next/client` and `@comvi/next/server` is
the base host, row for row as §0 describes, and every installer that table names
is re-exported from both entries. The second constructor name that briefly stood
beside it during 0.5 development for the bare host is deleted; the pre-release
rename table in §3 has it.

A client host is hydrated rather than loaded: nothing is ingested at
construction, and the catalog arrives through `<I18nProvider messages>`. So an
inline catalog takes `compiler: icuCompiler` in the same call, and so does a
catalog that arrives LATER, hydrated or fetched by an SSR loader. One option
covers both, and `icuCompiler` ships from both entries.

The server gains a compose-it-yourself companion, exported from
`@comvi/next/server` and nowhere else. That entry carries the toolkit too,
because `NextServerHost = WrapperI18nHost & I18nLoaderApi` makes the loader
mandatory for SSR:

```ts
import "server-only";
import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () => createI18n({ locale: "en" }).use(loader({ uk: () => import("./uk.json") })),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

Its options are routing-only; everything else belongs to the host factory. The
result is exactly `{ i18n, routing }`, with no `.use*` methods, and construction
is EAGER: `host()` runs exactly once, inside the call, so `result.i18n` is a
plain field and every server helper (`getI18n()` / `loadTranslations()`) resolves
that same instance. A factory that throws leaves nothing configured, and the
two-source conflict (this factory plus `setI18n`) is checked BEFORE `host()`
runs. `@comvi/next/server` exports no composed constructor and no tag entry.

**`setI18n` no longer replaces the instance.** In 0.4 a second call won, and the
last write took effect. In 0.5 it throws, in development and production, naming
both sources:

```
[comvi/next] i18n already configured by createNextI18nFromHost(); setI18n() is a second source. Configure it once — only a same-instance setI18n() repeats.
```

Its public signature is unchanged and a repeat call with the **same** instance
stays a no-op (setup modules commonly re-run). Test suites that re-configured
between cases need a fresh cell: vitest and jest isolate module state per test
file, which is normally enough. `_resetServerI18n()` is `@internal` and reachable
only from the package's own source, `../src/server/cache`. `@comvi/next`
publishes six `exports` keys and no wildcard, so an installed copy cannot import
it under any specifier.

**`createNextI18n(...).use(installer)` is the composition pipe, the same verb as every
other host.** The 0.4 scoped registration `use(plugin, { runtime, environment, lazy })` and
the four delegates `useClient`, `useServer`, `useClientLazy`, `useServerLazy` are gone.
Scoping is now two installers: `.use(nextPlugin(plugin, { runtime, environment }))` and
`.use(nextPluginLazy(load, { runtime, environment }))`. Pick the installer where
you write the call: `lazy` is no longer an option a value can decide at runtime.

**Locale routing** moved onto one shared implementation behind `@comvi/next` and
`@comvi/nuxt`. It is not a package you install and **neither package gained a
runtime dependency**: the shared code is workspace-private and arrives inside
each package's own build. Two URL behaviours changed with the move: a trailing
slash survives locale-prefix stripping (`/de/about/` → `/about/`, and the
middleware no longer redirects to normalize it), and interior duplicate slashes
are no longer collapsed (`/de//x` → `//x`). Prefix modes, the pathnames slug map
and root-path handling are unchanged.

## 6. `@comvi/nuxt`

**The generated default host is the base host.** Nuxt's entries are unchanged and
`useI18n()`, `useI18nLoader()`, `useI18nPlugins()`, `<T>` and `<NuxtLinkLocale>`
are still auto-imported, so no import in your app moves. What moved is what the
module hands them: with `hostModule` unset it builds text + `{param}`
interpolation, the cache, events and default params, and nothing else. Two
escapes answer different questions.

**`comvi.icu: true`** is a module option (default `false`) that makes the
generated host use `icuCompiler`. It exists because that host gives you nowhere
to call `.use()`. With `hostModule` set it is **not** ignored: the module passes
`{ ...options, compiler: icuCompiler }` to your factory, with `compiler` as the
last key, so `createI18n({ ...options })` compiles ICU and
`createI18n({ ...options, compiler: mine })` keeps yours. There is no warning
either way. ICU is never enabled without `icu: true` or a `compiler` you named.
See [What goes in the host file](packages/nuxt/README.md#what-goes-in-the-host-file).

**`hostModule`** is the composition escape, and the path for everything else:

```ts check=group=nuxt
// nuxt.config.ts
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./comvi.host.ts" },
});
```

```ts check=group=nuxt
// comvi.host.ts — default-export a factory returning a FRESH host per call
import {
  createI18n,
  icuCompiler,
  loader,
  plugins,
  devtools,
  type NuxtHostFactory,
} from "@comvi/nuxt/host";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })
    .use(loader({ uk: () => import("./uk.json") }))
    .use(plugins())
    .use(devtools())) satisfies NuxtHostFactory;
```

**One specifier, and it is `@comvi/nuxt`.** `@comvi/nuxt/host` re-exports exactly
the composition surface — `createI18n`, `icuCompiler`, `loader`, `attachLoader`,
`plugins`, `devtools`, `definePlugin` and the `NuxtHostFactory` type. The
low-level `attachPlugins` / `attachDevtools` pair is not on it, exactly as it is
not on the binding roots: import it from `@comvi/core/plugins` /
`@comvi/core/devtools` if a host file really wants the synonym. `@comvi/core` is a dependency of `@comvi/nuxt` rather than of your app, so
under pnpm's default layout a host file that named `@comvi/core/icu` did not
resolve from `pnpm add @comvi/nuxt` alone. Naming core's subpaths directly still
works if your app declares `@comvi/core` itself. `flattenCatalog` is deliberately
not on the subpath: the base host flattens a nested catalog itself.

Drop the lines you do not need. Their order is free (§0.1), and ICU is not a
composed capability at all: `compiler: icuCompiler` is a constructor field. The
rest of the map: SSR / async loading → `.use(loader(map))`; `comvi.setup`
registering a plugin with 0.4's `core.use(…)` → `.use(plugins())` and
`registerPlugin(…)`, or one `.use(definePlugin(fn))`; browser-extension
visibility → `.use(devtools())`; `<tag>` in plain `t()` → one
`import "@comvi/core/tags"`. Nested inline catalogs need nothing: every host
flattens them.

**The factory must return a core HOST, not a `VueI18n`.** The guard used to check
only for a `t()`, which a `VueI18n` has, so `@comvi/vue`'s `createI18n` passed it
and the module wrapped a wrapper. It now also requires `init()` and rejects the
wrapper's own `core` member, and its `TypeError` names
`createI18n from "@comvi/nuxt/host"`.

**Two module options were removed, and the third one people group with them stays.**

| 0.4 `comvi` option | 0.5.0                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `comvi.cdnUrl`     | removed. `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn`, in `comvi.host.ts` |
| `comvi.apiBaseUrl` | removed. The same loader plugin's own `baseUrl` option, in `comvi.host.ts`                       |
| `comvi.apiKey`     | kept, still forwarded to the host as `i18n.apiKey` — but it loads nothing on its own             |

Both were written into `runtimeConfig.public.comvi` and read by no runtime code,
so an app that set `cdnUrl` and expected translations got neither a load nor a
diagnostic. They are gone rather than wired, because a module composing a loader
on the app's behalf is exactly what `hostModule` exists to avoid.

```ts check=group=nuxt-cdn-host
// comvi.host.ts — what `comvi.cdnUrl` was supposed to do
import { createI18n, type NuxtHostFactory } from "@comvi/nuxt/host";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

export default ((options) =>
  createI18n(options).use(
    cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
  )) satisfies NuxtHostFactory;
```

**`comvi.translation` is new**, and it is `I18nOptions["translation"]` verbatim:
inline catalogs keyed `locale` or `"locale:namespace"`, forwarded into both the
client plugin's host and each request-scoped server host. It is what makes a
`comvi` block with no `hostModule` render an actual translation.

**The factory receives nuxt's resolved options**: `locale` (the render locale on
the client, the request locale on the server), `fallbackLocale`, `defaultNs`,
`defaultParams`, `devMode`, `apiKey` and `translation`. A composed host
therefore honours the same `nuxt.config` an uncomposed one does. A
0.5.0-development factory that takes no argument keeps working.

One option reaches only one of the two calls. The app plugin runs in both
bundles and adds `tagInterpolation` from `basicHtmlTags` plus `ssrLocale`, so a
server render and the hydrated client agree. The request-scoped Nitro host is
given the same `tagInterpolation`, so rich text off the request host keeps the
client's whitelist, but `ssrLocale` stays client-only: a request host is already
built at the request locale. Set `ssrLocale` inside the factory only if a server
route genuinely needs it.

**`NuxtServerHost` is the base host now**, not the loader-carrying host it named
before; `NuxtServerLoaderHost` is the composed one, and it is what SSR
translation loading needs. The server utilities probe with core's `hasLoaderApi`
rather than trusting an annotation: on a host with no loader, `loadTranslations`
warns once naming `hostModule` and returns whatever the catalog already holds,
and `useTranslation` translates without touching a member that is not there.

A `comvi.setup` hook used to call the capability **on the `VueI18n` proxy**
(`i18n.reloadTranslations()`). Those eight proxies are gone, so call the host
instead: **`context.core`**, which is the one member you can call the same way in
the client plugin and in a server utility. `context.i18n` is a union of `VueI18n`
and the bare host (`VueI18n<{}, C> | C`). Write the hook with no host type
(`satisfies NuxtI18nSetup`): the module generates `.nuxt/types/comvi-host.ts`,
which reads the host off your `comvi.host` factory's return type, so a call the
host cannot serve fails at type-check instead of at request time. Naming the
host by hand (`NuxtI18nSetup<I18n & I18nLoaderApi>`) stays supported for a
factory the module cannot see, and the generated file cross-checks that claim
against the factory.

Nuxt's rendering layer is `@comvi/vue`, so vue's `<T>` change carries through:
rendering rich text no longer switches string-API tag parsing on behind your
back. And `comvi.host.ts` stays the one file in a nuxt app that names comvi
specifiers. It is the composition root the module branches on, so reading it
tells you what the app pays for.

## 7. Errors you may now see

`useI18nLoader()` and `useI18nPlugins()` throw at the call site, in both build
conditions, never silently:

```
// development
[comvi] This i18n instance has no loader capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).
// production
[comvi] missing loader capability — attach @comvi/core/loader
```

Both of those are MESSAGES, not codes: neither error carries a `code` property,
in either build, so match on the text.

Beside those, 0.5 has a family of "is not a function" failures that all mean one
thing, that a capability was never composed, plus five named errors from the
composition rules — one of them raised only by the `@comvi/vue` and
`@comvi/next` wrappers, and one reachable only from JavaScript. This is the
whole list your first run can produce:

| symptom                                                                                                 | fix                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addActiveNamespace` / `removeActiveNamespace` / `reloadTranslations` / `onLoadError` is not a function | `useI18nLoader()`                                                                                                                                                                                                                                                                    |
| `onMissingKey is not a function`                                                                        | `useI18nPlugins()`                                                                                                                                                                                                                                                                   |
| vue: `i18n.registerLoader` / `i18n.registerPlugin` is not a function                                    | compose the capability on the factory result (`createI18n(…).use(attachLoader)`, `.use(plugins())`), then call it on `i18n.core`                                                                                                                                                     |
| vue: `i18n.core.reloadTranslations` will not type-check                                                 | the wrapper you hold was never composed — chain `.use(attachLoader)`; inside a component, `useI18nLoader()`                                                                                                                                                                          |
| `E_INSTALLER_AS_PLUGIN`                                                                                 | you handed an installer to `registerPlugin(…)` or `definePlugin(…)`; compose it instead, as `.use(installer(…))`                                                                                                                                                                     |
| `E_PLUGIN_INIT_RETURN`                                                                                  | a plugin returned a value — use a statement body                                                                                                                                                                                                                                     |
| `E_USE_NOT_INSTALLER`                                                                                   | `.use(…)` got something that did not hand the host back — a raw plugin; write `.use(definePlugin(fn))`, or the bare-name installer                                                                                                                                                   |
| `E_USE_HOST_IDENTITY`                                                                                   | vue and next: your installer returned a different object; return the host it was given. On next it is the `createNextI18n` result's `.use(f)`, and the object `f` must hand back is the `i18n` that result holds                                                                     |
| `E_LOADER_IMPORT_MAP`                                                                                   | `loader()` was called with no import map. A static map goes here — `.use(loader({ uk: () => import("./uk.json") }))`; a plain loader FUNCTION goes to `.use(attachLoader)` and then `registerLoader(fn)`. TypeScript rejects the bare call, so only a JavaScript caller reaches this |

Those `E_*` names are the **production** messages; a development build throws a
longer message instead. **Six** error identities are new in 0.5:
`E_ICU_SYNTAX`, `E_INSTALLER_AS_PLUGIN`, `E_LOADER_IMPORT_MAP`,
`E_PLUGIN_INIT_RETURN`, `E_USE_HOST_IDENTITY` and `E_USE_NOT_INSTALLER` — the
last five have a row above, and `E_ICU_SYNTAX` has the rest of this section.
**Three** of them carry a `code` own-property to branch on: `E_ICU_SYNTAX`,
`E_USE_HOST_IDENTITY` and `E_USE_NOT_INSTALLER`. `E_ICU_SYNTAX` is thrown in
development as an `IcuSyntaxError` carrying both `code` and `argumentType`, and
reported through `onError` with the same fields in production. The other three
names — `E_INSTALLER_AS_PLUGIN`, `E_LOADER_IMPORT_MAP` and
`E_PLUGIN_INIT_RETURN` — are the production message text and nothing more, like
the two capability messages above: no `code` property, so match on the message.

`E_LOADER_IMPORT_MAP` is the one a TypeScript app cannot reach: `loader(map)`
declares the map as a required parameter, so a bare `loader()` is a compile
error. A JavaScript caller gets it from the `loader()` call itself, before
`.use` and long before `init()`:

```
// development
[i18n] loader(importMap) requires the import map. A static map of import functions goes here: .use(loader({ uk: () => import('./uk.json') })). A plain loader FUNCTION goes to .use(attachLoader) followed by i18n.registerLoader(fn) — both from @comvi/core/loader.
// production
E_LOADER_IMPORT_MAP
```

Two more `E_ICU_SYNTAX` messages come from the ICU compiler itself, thrown at
ingestion in development and reported in production with the segment rendered
literally:

```
[i18n] ICU argument `{price, number}` is not supported: this compiler implements `plural`, `selectordinal` and `select`, each with a choice list like `other {…}`. Quote the braces ('{'…'}') or format the value in code and pass it as a plain {param}
```

Format the value in code and interpolate it as a plain `{param}`. `number`,
`date` and `time` are not implemented.

```
[i18n] The `plural` choice list `one {# item} other` is malformed; every selector needs a braced sub-message, as in `other {…}`
```

Give every selector a braced sub-message of its own. The plural `offset:` form
lands here too, not above: `offset:N` parses as a selector with no braced
sub-message.

**Two carried-over options now warn instead of doing nothing.** `init()` reports
each ONCE, in development only, when the option's capability was never composed:
`ns` with no loader (naming `.use(loader(map))`), and `instanceId` or
`exposeGlobal: true` with no discovery (naming
`.use(devtools({ instanceId }))`). Both are 0.4 shapes an upgraded app is likely
to still be passing, and both used to be accepted and then ignored in silence.
Production stays silent, per the fail-soft rule. `exposeGlobal: false` warns
about nothing: it asks for the absence a base host already delivers.

Two changes are silent: neither produces an error.

**`clearTranslations()` clears content, never intent.** In 0.4 and through the
0.5 pre-releases, `clearTranslations(undefined, ns)` also DEACTIVATED the
namespace, which was the only way to stop serving one. In 0.5 it no longer does,
so a reload or a locale switch refetches a namespace you cleared by name. The
deactivation moved to `removeActiveNamespace(ns)` /
`removeActiveNamespaces(ns[])` on the loader capability, which also cancels the
namespace's in-flight loads and leaves its cached catalogs alone. Where you
relied on the scoped clear to stop loading a namespace, call
`removeActiveNamespace(ns)`; where you wanted both, call both.

Deactivation has one exception: `reloadTranslations()` with nothing active left
falls back to the default namespace. Remove the LAST active namespace and the
next reload fetches the default one, so if the namespace you removed was itself
the default, its content comes back while `getActiveNamespaces()` stays empty. A
locale switch has no such fallback.

**Escapes travel with the grammar they escape.** `&lt;`, `&gt;`, `&amp;` and `\<`
exist to write a literal angle bracket inside a message that IS tag syntax, so on
a host with no tag extension they are ordinary characters and stay in the output.
Any tag extension brings them back: `import "@comvi/core/tags"`, or
`tagInterpolation.extensions` per call. **ICU apostrophe quoting is unaffected**:
`'{literal}'` and `''` are core grammar and still work everywhere, on both
compilers.

---

## 8. Tooling: one emitter behind `@comvi/cli` and `@comvi/vite-plugin`

Both tools now generate declarations through one shared emitter, so a project
that runs the CLI in CI and the Vite plugin in dev cannot see the two disagree.
The emitter is workspace-private and is inlined into both builds, so neither
package gained a dependency and there is nothing extra to install. Nothing to
change in a project either: generated files look the same, and the file no longer
carries a `Generated at:` line, so regenerating an unchanged schema stops
producing a diff.

One thing to do once, though: 0.5 quotes keys and parameter names with
`JSON.stringify` where 0.4 emitted single quotes and bare names. `--check` drops
the missing header line before comparing but not the quoting, so the first
`comvi typegen --check` after the upgrade reports the file **outdated** (exit 1)
in every repository. Run `comvi typegen` and commit the re-quoted file in the
upgrade commit.

`@comvi/cli`'s `TypeEmitter` class is **not** deprecated after all. A 0.5
pre-release note pointed programmatic callers at a standalone `@comvi/typegen`
package; that package stayed workspace-private, so `new TypeEmitter().generate(schema,
{ defaultNsName })` and the `comvi typegen` command remain the two supported
entry points and behave exactly as before. The schema types (`SchemaParam`,
`KeySchema`, `ProjectSchema`) are still exported from `@comvi/cli` and
`@comvi/vite-plugin` under the same names.

---

The long form, with measured byte tables, fixture and gate names and the
reasoning behind each decision, is in this file's git history.
