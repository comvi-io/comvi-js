# Composition: one entry, `.use(installer)`, and why ICU is not in the pipe

Design note. Nothing here is needed to use the library — the package READMEs have the
instructions. This is the reasoning behind the shape they teach, kept out of the READMEs so a
newcomer reads steps rather than rationale.

The host is the object `createI18n` returns: it holds the catalog, the current locale and `t()`.

## One entry per package

Every package publishes ONE host entry. A **capability** is an import you add to that entry, not a
second entry you switch to. A bundle carries a capability because you asked for it, composed with
`.use(…)` or, for ICU, named as the `compiler` option, and for no other reason.

| package         | the entry you import                       | host constructor                             | notes                                                                                                                                                                      |
| --------------- | ------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@comvi/core`   | `@comvi/core`                              | `createI18n`                                 | the base host, plus the pure capability subpaths below                                                                                                                     |
| `@comvi/react`  | `@comvi/react`                             | `createI18n`                                 | core's own constructor, re-exported by name                                                                                                                                |
| `@comvi/solid`  | `@comvi/solid`                             | `createI18n`                                 | core's own constructor, re-exported by name                                                                                                                                |
| `@comvi/svelte` | `@comvi/svelte`                            | `createI18n`                                 | core's own constructor, re-exported by name                                                                                                                                |
| `@comvi/vue`    | `@comvi/vue`                               | `createI18n`                                 | builds the `VueI18n` preset over a base host, and `.use(…)` composes on the result; `createI18nFromCore` wraps a host built elsewhere with `createI18n` from `@comvi/core` |
| `@comvi/next`   | `@comvi/next/client`, `@comvi/next/server` | `createI18n`                                 | a RUNTIME split, not a host tier; `createNextI18n` on `@comvi/next` composes the 0.4 capabilities, but not the compiler                                                    |
| `@comvi/nuxt`   | auto-imported                              | the module's generated host, or `hostModule` | the default generated host is the base host; `hostModule` is the composition escape                                                                                        |

Capabilities are core's pure subpaths, re-exported **by name** from every framework entry except
`@comvi/nuxt`, so the ones you never call are pruned by your bundler. The repo's bundler matrix
asserts that from the emitted module graph in webpack and vite, development and production.
(`@comvi/nuxt` is the exception: app code imports nothing, so the toolkit is not on the module's own
entry. Composition happens in one file, `comvi.host.ts`, and the values come from `@comvi/nuxt/host`
— so the recipe follows from `npm install @comvi/nuxt` and nothing else; a `TranslationKeys`
augmentation targets `@comvi/core`, which the app declares.)

| you want                                                              | you add                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ICU `plural` / `select` / `selectordinal`                             | `compiler: icuCompiler` in the constructor options                              |
| async / remote loading                                                | `.use(loader(importMap))` or `.use(attachLoader)`                               |
| the plugin host: `registerPlugin`, post-processors, missing-key hooks | `.use(plugins())`                                                               |
| your own inline plugin, in one call                                   | `.use(definePlugin(fn))`                                                        |
| browser-extension discovery (`instanceId`, `window.__COMVI__`)        | `.use(devtools())`                                                              |
| `<tag>` markup inside plain string-API `t()`                          | `import "@comvi/core/tags"` once, anywhere in the app                           |
| a nested inline catalog (`{ nav: { home } }`)                         | nothing; every host flattens it, so `t("nav.home")` resolves                    |
| rich text through `<T>`                                               | nothing; `<T>` uses the pure `@comvi/core/rich-text` path and registers nothing |

```ts
import { createI18n } from "@comvi/core"; // the base host
import { icuCompiler } from "@comvi/core/icu"; // ICU plural/select/selectordinal
import { loader } from "@comvi/core/loader"; // async / remote loading
import { plugins } from "@comvi/core/plugins"; // the plugin host
import { devtools } from "@comvi/core/devtools"; // extension discovery
import "@comvi/core/tags"; // ambient <tag> syntax

const i18n = createI18n({ locale: "en", compiler: icuCompiler })
  .use(loader({ uk: () => import("./uk.json") }))
  .use(plugins());
```

One build is the exception to "a capability because you composed it": the CDN global always carries
ICU, whether or not the page asks, because a `<script src>` has no tree-shaking and so no byte
choice to offer. Every constructor, `createNextI18n` included, leaves the compiler to the caller.
`createNextI18n` is still an exception for the other capabilities — it composes tags, the loader,
the plugin host and devtools inside the package — but it is not the base host and not what
`createI18n` returns on any entry.

First-party plugins ship a lowercase **installer** beside the uppercase factory, and the installer
composes whatever capabilities that plugin needs: `.use(cdnLoader({ cdnUrl }))`,
`.use(localeDetector())`, `.use(inContextEditor())`.

## `.use(installer)` — the composition pipe

`.use` is on the base class, so every host has it. It is a pipe and nothing more: `i18n.use(f)` **is**
`f(i18n)`. Composition stays part of the construction expression instead of a wrapper around it.

```ts
import { createI18n } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
})
  .use(loader({ uk: () => import("./uk.json") }))
  .use(plugins());

i18n.registerPlugin(LocaleDetector({ supportedLocales: ["en", "uk"] }));

await i18n.init();
i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
```

### Installers versus factories

An **installer** is any `(host) => host`, so the `attach*` functions are installers already.
`.use(attachLoader)` works, and it is what you want for a host you will hand a plain `LoaderFn`:

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";

const i18n = createI18n({ locale: "en" }).use(attachLoader);
i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

`loader(map)`, `plugins()` and `devtools()` are the _configured_ installers: they attach **and**
configure in the same call. For the loader that is one sentence, because the import map is
**required**: a static map of import functions goes to `.use(loader(map))`; a plain `LoaderFn` goes
to `.use(attachLoader)` followed by `registerLoader(fn)`, as above. A bare `loader()` is a compile
error, so there is no third form and nothing to weigh — and the import-map adapter is in your
bundle only when you actually hand over a map.

Your app's own inline plugin reaches the queue through `definePlugin(fn, options?)` from
`@comvi/core/plugins`: `.use(definePlugin((i18n) => { … }))` composes the plugin host and registers
`fn` in the same call. An installer widens the host **in place** and hands that same host back, so
`.use` refuses anything else, whatever its shape: give it the raw plugin and it throws
`E_USE_NOT_INSTALLER`. The check is identity, not shape, which is why an async plugin cannot slip
past it — and why `.use` is not a place to register one: it calls the function before it checks, so
the promise that function returns is never awaited. `definePlugin(fn)` and `registerPlugin(fn)` put
the plugin in the queue, where `required`, `timeout` and `onError` apply to it.

### Composing twice, and composing late

Installing is idempotent, and installs land as **non-enumerable own properties** with ordinary
method descriptors, so `Object.keys(i18n)`, spread copies and `JSON.stringify` see exactly what they
saw before. Attaching a capability a host already has — a second `.use(attachLoader)` — installs
nothing and shadows nothing.

Configuration is not installation, and the difference matters for exactly one installer.
`loader(map)` attaches and then calls `registerLoader` with the map it was given
(the `loader` installer in `packages/core/src/loader.ts`), so a second `loader(map)` on an already-composed host still
registers its map: the capability is a no-op, the map is not. Nothing else in the surface configures
on attach.

Composing after `init()` warns once per host, in development only
(`warnLateCompose`, and the `warned` WeakSet it dedupes on, in
`packages/core/src/utils/lateCompose.ts`). Once per host rather than once per call, so a
chained `.use(attachLoader).use(plugins())` reports it once instead of twice. **Compose before
`init()`.**

> **Compose the loader alongside the plugin host. Order between them is free.**
> Plugins run during `init()`, and a loader-registering plugin (for example
> `@comvi/plugin-fetch-loader`) calls `registerLoader` on the instance. If the loader capability was
> never composed at all, that call is a `TypeError` at `init()` time, not a compile error. Composing
> both is what fixes it, and either chain does it:
> `createI18n({ … }).use(attachLoader).use(plugins())` and
> `createI18n({ … }).use(plugins()).use(attachLoader)` are equivalent, because every capability
> composed before `init()` is attached by the time plugins run.
>
> Beyond that the library has no ordering rule. ICU is not composed at all: it is
> `compiler: icuCompiler` in the constructor options, and it covers every catalog source.

## Why ICU is a constructor option and not an installer

`compiler: icuCompiler` is a constructor field held for the instance's life, so one option covers
every catalog source. `createI18n({ translation, compiler: icuCompiler })` for inline catalogs,
`createI18n({ locale, compiler: icuCompiler }).use(cdnLoader({ … }))` for remote ones, and nothing
about where the catalog came from changes the answer.

An installer widens a host that already exists. A compiler has to be in place before the first
catalog is ingested, and the constructor is the only moment that is true of every host. An `icu()`
installer would have been a capability you could compose too late — after `translation` had already
been walked — and the failure would have been a catalog that renders literally for reasons nothing
in the chain shows. There is no `icu()` installer, and no `.use(…)` composes ICU.

## What the base host does not have

Everything below is a **compile error** on the base host until you compose the subpath in.
TypeScript catches a missing capability, so you never discover one in production.

| Capability            | Subpath                                                 | Members                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Async loading         | `@comvi/core/loader` (`attachLoader`)                   | `registerLoader`, `getLoader`, `reloadTranslations`, `addActiveNamespace(s)`, `removeActiveNamespace(s)`, `onLoadError`                                                                                |
| Import-map loading    | `@comvi/core/loader`                                    | `createImportMapLoader`, and `loader(map)` to attach + register in one call                                                                                                                            |
| Plugin host           | `@comvi/core/plugins` (`plugins()`, `definePlugin(fn)`) | `registerPlugin`, `setPluginData`, `getPluginData`                                                                                                                                                     |
| Locale detection      | `@comvi/core/plugins`                                   | `registerLocaleDetector`, `getLanguageDetector`                                                                                                                                                        |
| Missing-key callbacks | `@comvi/core/plugins`                                   | `onMissingKey`                                                                                                                                                                                         |
| Post-processors       | `@comvi/core/plugins`                                   | `registerPostProcessor`                                                                                                                                                                                |
| Devtools discovery    | `@comvi/core/devtools` (`devtools()`)                   | `instanceId`, the `window.__COMVI__` queue protocol, removal on `destroy()`                                                                                                                            |
| ICU plural/select     | `@comvi/core/icu`                                       | `createI18n({ …, compiler: icuCompiler })`                                                                                                                                                             |
| Component-side access | `@comvi/core/loader`, `@comvi/core/plugins`             | `acquireLoaderApi(host)`, `acquirePluginsApi(host)`: the one implementation behind every binding's `useI18nLoader()` / `useI18nPlugins()`; throws the capability error when the host never composed it |
| Rich-text components  | `@comvi/core/rich-text`                                 | pure `prepareTranslation` / VirtualNode toolbox; tag syntax is passed per call and never registered ambiently                                                                                          |
| String-API tags       | `@comvi/core/tags`                                      | ambient registration plus the same rich-text toolbox, and `&lt;` / `&gt;` / `&amp;` and the `\<` escape                                                                                                |

`@comvi/core/rich-text` also exports `registerTagSyntax` itself, so you can opt into the same
ambient registration `@comvi/core/tags` performs — explicitly, next to `prepareTranslation` —
without importing that second subpath.

### Three placements are not where you might guess, and one non-placement

- **`addActiveNamespace(s)` / `removeActiveNamespace(s)` live on `/loader`.** Activating a namespace
  only means anything when something loads namespaces. The base host activates implicitly instead:
  `addTranslations` self-activates the namespaces it carries. `removeActiveNamespace(ns)` is the
  deactivation. `clearTranslations()` drops CONTENT in every form and never changes which namespaces
  are active.
- **`onLoadError` lives on `/loader`.** Only the loader capability can emit `loadError`, so
  subscribing to it without a loader would be a no-op by construction.
- **Discovery lives on `/devtools`.** `instanceId` and the `window.__COMVI__` handshake exist for
  browser extensions; an app that ships no extension integration should not carry a `window`
  protocol. `.use(devtools({ instanceId, exposeGlobal }))` takes the two options the 0.4 root read
  off `createI18n`.
- **Nested-catalog flattening is NOT on `/loader`**, and not on any subpath. It is base-host
  behaviour: turning `{ nav: { home } }` into `"nav.home"` happens at the one place a catalog
  enters, whether or not anything is composed.

The `postProcess` and `onMissingKey` **constructor options** stay universal: they work on the base
host. Only the runtime _registration_ APIs are part of the plugin-host capability.

## An option whose capability never arrived says so

Two options are accepted by the base host and then do nothing there, because the code that reads
them belongs to a capability. `init()` reports each one ONCE, in development only:

- **`ns`** (initial namespaces) with no loader composed: `init()` has nothing to load with, so the
  warning names `.use(loader(map))`.
- **`instanceId`, or `exposeGlobal: true`**, with no discovery composed: nothing touches
  `window.__COMVI__`, so the warning names `.use(devtools({ instanceId }))`.

The report is at `init()` rather than in the constructor, because both capabilities are legally
composed after construction and before `init()`. Production stays silent: a missing capability is
not a boundary violation, so the fail-soft rule applies.

**`exposeGlobal: false` is deliberately silent.** It asks for the absence a base host already
delivers, so there is nothing to report — and 0.4 boilerplate that carries it is not worth a
warning.

## Installer or plugin: swapping the slots is loud both ways

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { CdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" }).use(attachLoader).use(plugins());

i18n.registerPlugin(CdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));
```

Swapping the two slots is a type error, and both halves are caught at runtime as well.
`registerPlugin(cdnLoader(…))` throws `E_INSTALLER_AS_PLUGIN` at `init()`, on the installer's first
ensure-step, before any capability is attached. `.use(CdnLoader(…))` throws `E_USE_NOT_INSTALLER`:
`.use` is a pipe and nothing more — it never inspects, orders or brands the function you hand it —
but it does check the one thing that makes a function an installer. It calls the function before it
checks, so this plugin runs outside `init()`'s drain loop and, being async, hands back a promise
nobody awaits. Register it with `registerPlugin` instead, where the queue gives it `required`,
`timeout`, `onError` and cleanup.

Plugins run sequentially during `.init()`, with timeout protection (10s default) and error recovery
for non-required plugins. A plugin may return **nothing or a cleanup function**, which is called on
`.destroy()` in LIFO order. Any other return value throws at `init()`: write a statement body
(`() => { ready = true; }`), never an expression-bodied arrow (`() => (ready = true)`, which returns
`true`).

## The framework bindings are typed against the base host

`@comvi/{react,solid,svelte,vue,next,nuxt}` are typed against `WrapperI18nHost`, which is
`I18nCoreInstance & I18nCoreExtraApi` and is exactly what a base host implements. So the same
component code runs on a base host or on any composition of it. The provider and context entry
points accept slightly more than that name: `WrapperI18nHost<D>` is invariant in `D`, so react,
solid and svelte widen `setDefaultParams` and `init` on the parameter type, and a host built with
`defaultParams` is accepted rather than rejected. Loader and plugin members are not part of
`useI18n()`; you acquire them through `useI18nLoader()` / `useI18nPlugins()`, which throw a named
error (in development **and** production) on a host that lacks the capability rather than being
typed present and failing at an arbitrary call site later.

Each binding re-exports the capability toolkit it needs, so an app names one package and nothing
else.

## The CDN global build starts composed

`unpkg`/`jsdelivr` serve a fully composed bundle built from its own entry. A `<script src>` consumer
has no import graph to extend, so the global keeps ICU, ambient tags, the loader, the plugin host
and discovery, and also exposes `icuCompiler`, `flattenCatalog`, `prepareTranslation`,
`registerTagSyntax` and `tagSyntaxExtension`. ESM starts from the base host; the global starts
composed. Nothing else in the package is published two ways.

## Related

- [ICU](icu.md) · [Rich text](rich-text.md) · [Formatting](formatting.md) · [SSR](ssr.md) ·
  [Limitations](limitations.md)
- [MIGRATION.md](../../MIGRATION.md) — the 0.4 → 0.5 table and the renames
