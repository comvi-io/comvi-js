# Migrating to comvi 0.5.0 — one entry per package

Source version: **0.4.x** (0.5.x was never published). Two things changed, and
the first one is a **breaking change to published API** riding the pre-1.0
minor-bump policy:

0. **`@comvi/core` is now ONE entry — the base host.** Capability is an import
   you add, never an entry you switch. The separate base-host subpath that 0.5
   development carried beside the root is deleted; it never published, so there
   is no deprecation debt. §0 below is the whole story.
1. Every framework binding runs on that host, which moved four loader/plugin
   members out of `useI18n()` (§1 onwards). Mechanical, and mostly codemodded.

---

## 0. The root entry changed semantics

The 0.4 root was batteries-included. The converged root is the base host: text +
`{param}` interpolation, the cache, events, default params and `.with()`.

| 0.4 root behaviour                           | converged root                | loudness                                                             | migration                                                                 |
| -------------------------------------------- | ----------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ICU plurals / select                         | not compiled by default       | **dev throws; prod renders it literally and reports** `E_ICU_SYNTAX` | inline: `compiler: icuCompiler`; remote: `.with(icu())` before the loader |
| `.use(plugin)`                               | absent                        | TS error + runtime `TypeError`                                       | `.with(plugins()).use(p)`, or a plugin package's lowercase installer      |
| loader (`registerLoader`, …)                 | absent                        | existing loud capability error                                       | `.with(loader())` / `fetchLoader(opts)`                                   |
| discovery (`instanceId`, `window.__COMVI__`) | absent                        | invisible to the extension (documented)                              | `.with(devtools())`, or the in-context-editor installer                   |
| nested catalogs                              | stored verbatim               | dev warning                                                          | `flattenCatalog(…)`, or compose `loader()`                                |
| string-API tags (`"<b>hi</b>"`)              | literal text                  | dev warning; prod literal                                            | `<T>`, or `import "@comvi/core/tags"`                                     |
| `new I18n(options)`                          | unchanged, one argument       | —                                                                    | —                                                                         |
| published `createNextI18n`                   | unchanged composed host       | —                                                                    | —                                                                         |
| the CDN global                               | unchanged, batteries-included | —                                                                    | —                                                                         |
| a plugin returning a value                   | rejected at `init()`          | throws through the plugin error path                                 | return nothing or a cleanup function: `() => { flag = true; }`            |

### 0.1 The compiler has a timing rule

```ts
// INLINE catalogs — the constructor ingests them, so choose the compiler here.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
const i18n = createI18n({ locale: "en", translation, compiler: icuCompiler });

// REMOTE catalogs — the installer, BEFORE anything is ingested.
import { icu } from "@comvi/core/icu";
const i18n = createI18n({ locale: "en" }).with(icu()).with(fetchLoader({ … }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks irreversibly at the
first catalog that reaches the host — a constructor `translation`, an
`addTranslations` call (even an empty one), or a loader merge — and a later
`icu()` throws with own `code === "E_COMPILER_LOCKED"` **before** mutating
anything. `clearTranslations()` does not unlock it. So
`createI18n({ translation }).with(icu())` is invalid by construction: in
development the ingestion check throws first, in production the host locks and
the installer throws. `E_COMPILER_LOCKED` is loud in BOTH conditions — only the
ICU-syntax failure below differs between them. No cache is ever cleared or rekeyed — the lock is what
proves no compiled template can exist yet.

### 0.2 The ICU failure is structured, and its context is yours

`E_ICU_SYNTAX` owns exactly `code` and a truthful `argumentType` (`"plural"`,
`"select"`, `"selectordinal"`, or the parsed token such as `"number"` / `"date"`
/ `"other"`, for which the message explicitly does NOT claim shipped ICU
support) — and nothing else. **Locale, namespace, key and catalog source are
application-supplied telemetry**, not core-error fields: core does not know
which of your loaders produced the catalog, and inventing a field it cannot fill
truthfully would cost every user bytes. In production the host supplies what it
DOES know through the report context, so `onError` is the seam:

```ts
const i18n = createI18n({
  locale: "en",
  onError(error, context) {
    if ((error as { code?: string }).code === "E_ICU_SYNTAX") {
      // context: { source: "compile", key, namespace, locale }
      report(error, { ...context, source: "cdn-catalog" });
    }
  },
});
```

Development is **eager**, and the throw lands where the template is COMPILED:
at ingestion for catalog strings, so a bad one throws where it entered, before
a single render; at first compile for a template that never passes through
ingestion — a per-call `params.fallback`. Production never
crashes on it: the braced segment renders **literally**, exactly as authored,
and `E_ICU_SYNTAX` is reported through `onError` (or `console.error` when no
handler is configured) on the compilation that hit it — best-effort, per
process, never on cached renders, so a hot key costs one report and not one per
render. A literal `{count, plural, …}` in the UI is visibly broken in the same
way a literal `<b>` is; what it never does is take the page down. The dev walk
costs the production bundle **0 B**.

### 0.3 Residuals — named, not solved

- **String-API tags without a tag extension render literally.** Statically
  indistinguishable from text, so there is a dev warning and no prod throw. In a
  UI review a literal `<b>` is visibly broken, unlike a plausible-looking plural.
- **Discovery is invisible until installed.** An app on the base host is not
  picked up by the browser extension until it composes `devtools()` or the
  in-context-editor installer.
- **Nested catalogs are stored verbatim** on a host without the loader
  capability (dev-warned). `flattenCatalog` is the pure escape hatch.
- **Runtime-loaded ICU catalogs** convert from "works" to "throws in
  development, renders literally and reports in production" until the host
  installs an ICU-capable compiler pre-ingestion. Deliberately loud, never
  silent, and never fatal to a production page.
- **Reflective consumers**: `instanceId` is absent unless discovery is
  installed, and the loader/plugin members are no longer on the prototype chain.

## 1. Why anything moved

`useI18n()` used to hand you `addActiveNamespace`, `reloadTranslations`,
`onLoadError` and `onMissingKey`. Those four are not part of the translation
core — they belong to the `@comvi/core/loader` and `@comvi/core/plugins`
capabilities. Keeping them on `useI18n()` meant the hook's return type promised
methods a base host does not have:

- **svelte** crashed outright: `useI18n()` `.bind()`-ed them in the object
  literal it returned, so a base host threw before rendering anything.
- **solid** deferred the crash to `undefined is not a function` at whatever call
  site touched one.
- **react/vue** typed them present and failed later.

  0.5.0 makes the common hook type-honest **by absence**: the four members do not
  exist on its return, in types or at runtime, in development or in production.
  They are acquired explicitly, and a host without the capability fails at that
  one call with a message naming the fix.

## 2. The migration table

| 0.4.x                                                                                                                                                                                               | 0.5.0                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `const { reloadTranslations, addActiveNamespace, onLoadError } = useI18n()`                                                                                                                         | `const { reloadTranslations, addActiveNamespace, addActiveNamespaces, onLoadError } = useI18nLoader()`                                                                   |
| `const { onMissingKey } = useI18n()`                                                                                                                                                                | `const { onMissingKey } = useI18nPlugins()`                                                                                                                              |
| `const { t, reloadTranslations } = useI18n("ns")`                                                                                                                                                   | `const { t } = useI18n("ns")` + `const { reloadTranslations } = useI18nLoader()` — the namespace argument stays on `useI18n`; the capability APIs take **no** parameters |
| vue `i18n.registerLoader(…)` / `.reloadTranslations()` / `.onMissingKey(…)` / `.registerLocaleDetector(…)` / `.registerPostProcessor(…)` / `.onLoadError(…)` / `.addActiveNamespace(…)` / `.use(…)` | `i18n.core.registerLoader(…)` etc. — `VueI18n` exposes the host it wraps as `readonly core`                                                                              |
| vue `new VueI18n(options)`                                                                                                                                                                          | `createI18n(options)` — the constructor now takes `(core, vueOptions)`                                                                                                   |
| svelte/solid `getI18nContext().reloadTranslations()` / `useI18nContext().reloadTranslations()`                                                                                                      | `useI18nLoader()` inside a component, or hold your own host instance                                                                                                     |
| nuxt `comvi.setup` hook calling a dropped `VueI18n` proxy                                                                                                                                           | `i18n.core.*`                                                                                                                                                            |
| next: a second `setI18n(other)` reconfiguring the server                                                                                                                                            | one configuration source per process — see §6                                                                                                                            |

`useI18nLoader()` and `useI18nPlugins()` are exported from every binding
(`@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`,
`@comvi/next/client`; auto-imported in `@comvi/nuxt`). Their names are identical
across bindings on purpose — one grep finds the whole surface. The bag they
return is referentially stable per host instance, so two components under one
provider get the same function references.

## 3. The codemod

```
pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx,vue,svelte}" [--report report.json]
```

| exit | meaning                                      |
| ---- | -------------------------------------------- |
| `0`  | clean, or fully transformed                  |
| `2`  | rewrites applied **and** manual items remain |
| `1`  | error                                        |

One command covers both halves of 0.5.0, because you migrate once.

**The capability hooks.** It rewrites pure, mixed, aliased and repeated
destructures, drops the now-illegal namespace argument from the capability call,
merges into a capability destructure that already exists in the same function,
and maintains the import statement (adding the hooks, removing an orphaned
`useI18n`).

**The single entry.** It also migrates the shapes the one-entry convergence
changed, host construction by host construction:

| shape                                                          | becomes                                       |
| -------------------------------------------------------------- | --------------------------------------------- |
| `@comvi/<pkg>/slim` — react, solid, svelte, vue, next client   | `@comvi/<pkg>`                                |
| `@comvi/core/slim`                                             | `@comvi/core`                                 |
| `createSlimI18n`                                               | `createI18n` (import, references and aliases) |
| `.use(FetchLoader(o))` and the two other first-party factories | `.with(fetchLoader(o))` in place              |
| `.use(YourPlugin(o))`                                          | `.with(plugins()).use(YourPlugin(o))`         |
| inline `translation` with ICU comma syntax                     | `compiler: icuCompiler` in the same call      |
| `exposeGlobal` / `instanceId` options                          | `.with(devtools({ … }))`, options moved       |
| a nested inline `translation` catalog                          | `flattenCatalog(…)`, per locale               |
| `.with(icu())` after a loader in one chain                     | `.with(icu())` moved BEFORE the loader        |

Every binding a rewrite introduces is imported in the same pass — merged into
the `@comvi/*` import the file already has, or added on its own line after it —
and an uppercase factory whose last reference just left is dropped from its
import. `new I18n(options)` migrates exactly like `createI18n(options)`.

A chain is the unit: `createI18n(…)` plus the `.use` / `.with` calls chained
directly onto it. Nothing outside a chain is guessed at, comments, directive
prologues, shebangs and CRLF endings survive, and running the codemod twice is a
byte-identical no-op.

The report counts what it did per shape (`transform  nested-catalog x2`), so a
release note can name the migrations a tree actually needed.

**It never rewrites silently.** These shapes are reported — sorted by
`path:line:column`, as a human list and as JSON — and left alone:

- rest spreads (`const { t, ...rest } = useI18n()`)
- computed member access
- a hook result stored in a variable (`const bag = useI18n(); bag.reloadTranslations()`)
- a hook result crossing a function boundary
- a local name that would collide with a hook or an installer the codemod wants
  to introduce
- `useI18n` or `createI18n` imported from a relative path or a nuxt auto-import
  (the driver will not guess where the capability API lives — `manual-import`)
- `.vue` / `.svelte` script blocks that fail extraction
- the eight dropped `VueI18n` instance proxies, in `.vue` files and
  `comvi.setup.*` modules: `i18n.reloadTranslations()` may be a `VueI18n`
  (migrate to `i18n.core.*`) or a raw core instance (already correct), and the
  receiver's type is textually undecidable
- `.use(...plugins)`, `.use([a, b])`, `.use(registry[key])` and every other
  `.use` whose plugin is not a statically named factory call, plus `.use` on a
  stored host (`const i18n = createI18n(…); i18n.use(p)`) — the fix is a change
  at CONSTRUCTION, so the recipe is printed instead
- a first-party factory NAME that is not a first-party import
  (`const FetchLoader = pkg.FetchLoader`), which cannot be resolved to the
  package that owns the installer
- `exposeGlobal` / `instanceId` next to a chain that already composes
  `devtools(…)`: merging them would decide a precedence you never wrote
- `createI18n(optionsBuiltElsewhere)` — the codemod cannot see whether those
  options carry ICU syntax, a nested catalog or the two discovery options
- catalogs loaded at RUNTIME: if a loaded catalog uses ICU syntax, compose
  `.with(icu())` before the loader yourself. Nothing textual proves what a CDN
  will return, so this one is advisory on every chain that composes a loader
  without a compiler

## 4. Per binding

### One package per app

A host used to take two packages to build: the constructor from
`@comvi/core`, the bindings from `@comvi/<framework>`. 0.5.0 closes that. Every
binding now carries the base constructor and the capability toolkit on the ONE
entry it publishes:

```ts
import { createI18n, icuCompiler, loader } from "@comvi/react";
//        ^ core's own constructor  ^ from @comvi/core/icu   ^ from @comvi/core/loader

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
```

| binding         | single-package specifier | host constructor                                              |
| --------------- | ------------------------ | ------------------------------------------------------------- |
| `@comvi/react`  | `@comvi/react`           | `createI18n`                                                  |
| `@comvi/solid`  | `@comvi/solid`           | `createI18n`                                                  |
| `@comvi/svelte` | `@comvi/svelte`          | `createI18n`                                                  |
| `@comvi/vue`    | `@comvi/vue`             | `createI18n` (one-call) / `createCore` / `createI18nFromCore` |
| `@comvi/next`   | `@comvi/next/client`     | `createI18n`                                                  |
| `@comvi/next`   | `@comvi/next/server`     | `createI18n`                                                  |
| `@comvi/nuxt`   | auto-imported            | see the nuxt section                                          |

`@comvi/next`'s two rows are a RUNTIME split — client bundle versus server
module — not a host-tier split: both entries publish the same base constructor
and the same toolkit. No package publishes a second host tier any more.

Nine bindings are re-exported on every one of those entries — `@comvi/nuxt` is
the deliberate exception, see below — `icu`,
`icuCompiler`, `loader`, `attachLoader`, `flattenCatalog`, `plugins`,
`attachPlugins`, `devtools`, `attachDevtools` — plus the base `I18n` class and
the core type vocabulary. `icu` is in that set because each entry is now the
package's whole surface: there is no second specifier to fall back on for the
pre-ingestion installer, so the remote-catalog ICU recipe has to be reachable
from the one import an app already has. They are **named** re-exports of core's
own bindings, so the ones you do not call are pruned: the bundler-matrix cases
assert the unused capability subpaths never enter the module graph, in webpack
and vite, development and production.

`@comvi/nuxt` does not re-export that toolkit, and that is the point: a nuxt app
imports nothing at all, because `useI18n()`, `useI18nLoader()`,
`useI18nPlugins()`, `<T>` and `<NuxtLinkLocale>` are auto-imported. Composition
lives in the one `hostModule` file, which names `@comvi/core` and its subpaths
directly — see the nuxt section below.

`createI18n` IS core's own constructor on every binding but `@comvi/vue`, whose
`createI18n` builds the `VueI18n` preset around it; there, `createCore` is core's
constructor and `createI18nFromCore` takes a host you built yourself.

### `.with(installer)` — composing a capability

`.with` is on every host, base or composed. It is a pipe and nothing more:
`i18n.with(f)` **is** `f(i18n)`. What it buys is that composition becomes part
of the construction expression instead of a wrapper around it:

```ts
// 0.5.0 — one expression
const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));

// still supported — the low-level API the installers delegate to
const i18n2 = attachLoader(createI18n({ locale: "en" }));
i18n2.registerLoader(myLoader);
```

An **installer** is any `(host) => value`, so `attachLoader`, `attachPlugins`
and `attachDevtools` are installers already: `.with(attachLoader)` works.
`loader()`, `plugins()` and `devtools()` are the _configured_ installers — they
attach **and** configure in the same call.

| installer            | attaches    | also configures                                        |
| -------------------- | ----------- | ------------------------------------------------------ |
| `loader(importMap?)` | `/loader`   | registers the import map (adapter + default-ns wiring) |
| `plugins()`          | `/plugins`  | nothing yet — the host takes no options                |
| `devtools(options?)` | `/devtools` | `instanceId` / `exposeGlobal`                          |

**Pick the installer by what you have.** `loader` names the import-map adapter
statically, so referencing it pulls that adapter into your graph whether or not
you pass a map (measured: +111 B min+gz on the next server graph, +124 B on the
composed core-base graph). With an import map, use `loader(map)` — you need the
adapter anyway. With a plain `LoaderFn`, use `.with(attachLoader)` and register
it yourself; that costs 2 B over calling `attachLoader(host)` directly.

Composing a capability a host **already has** is a no-op: nothing is installed,
no own property shadows the inherited prototype member, and registered state is
kept. That holds for a second `.with(loader())` on a host that already has it, and
for any `.with(…)` on the internal composite the CDN global ships.

**Plugins on a composed host.** The three first-party plugin packages now ship
a lowercase INSTALLER each, next to the uppercase factory they always had. The
installer composes the capabilities that plugin needs and then registers it —
one call instead of three:

```ts
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(
  fetchLoader({ cdnUrl: "https://cdn.comvi.io/my-project" }),
);
await i18n.init();
```

| package                           | `.with(lowercase)`          | `.use(Uppercase)` — unchanged     |
| --------------------------------- | --------------------------- | --------------------------------- |
| `@comvi/plugin-fetch-loader`      | `fetchLoader(options)`      | `FetchLoader(options)`            |
| `@comvi/plugin-locale-detector`   | `localeDetector(options?)`  | `LocaleDetector(options?)`        |
| `@comvi/plugin-in-context-editor` | `inContextEditor(options?)` | `InContextEditorPlugin(options?)` |

What each installer composes, idempotently: `fetchLoader` → `@comvi/core/loader`
then `@comvi/core/plugins`; `localeDetector` → `@comvi/core/plugins` only (it
hands core a locale, it never loads a catalog); `inContextEditor` →
`@comvi/core/devtools` then `@comvi/core/plugins`, so an editor-enabled host is
visible to the browser extension without a second `.with(devtools())`.

The uppercase factories are unchanged, and the explicit recipe still works
exactly as it did — reach for it when you compose capabilities yourself or
register plugins from a list:

```ts
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(loader()).with(plugins());
i18n.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/my-project" }));
```

`loader()` before `plugins()` when a plugin registers a loader — plugins run at
`init()`, and `registerLoader` has to exist by then. The installers already
order their own attaches that way.

No lifecycle is duplicated. An installer's last act is `use`, so `required`,
`timeout`, `onError`, cleanup registration and LIFO destroy all keep running
inside `I18nPluginHost` exactly as before. Two timing details are worth
knowing: `fetchLoader` builds its plugin while it composes, so a missing
`cdnUrl` throws at COMPOSITION rather than at `init()`; and
`inContextEditor` returns the host type UNCHANGED, because under the package's
`production` export condition it is `(host) => host` and promising
`I18nPluginHostApi` there would be a member typed present and absent at once.
Compose `.with(plugins())` when you want `use` yourself.

**Swapping an installer and a plugin.** Nothing is branded. `.with` is a pipe
and nothing more — no registry, no ordering, no dispatch — so an installer and
a plugin are told apart by their signatures alone. Both cross-uses are TYPE
errors, and both are loud at runtime:

| you wrote                                     | what happens                                                                                                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.use(fetchLoader(…))`                        | throws at `init()`, on the installer's first ensure-step: **before** any capability is attached, before a second plugin reaches the queue, before any status or cleanup changes. The message names the installer and the `.with` form. |
| `.use(inContextEditor(…))` under `production` | the identity no-op has no ensure-step to stop on, so it runs and hands the host back — and a plugin may only return nothing or a cleanup function, so `init()` rejects the RESULT, before anything is queued for teardown              |
| `.with(FetchLoader(…))`                       | the pipe calls the plugin against a host that has none of the capabilities it needs, so the invocation is rejected                                                                                                                     |

Both runtime guards live in `@comvi/core/plugins`, so a base host that composes
no plugin capability carries neither. The first one is exported —
`ensureInstallable(host, name)` — so a third-party installer gets the same
behaviour and the same actionable message by calling it first.

**The return-shape rule is a real break for plugin authors**, independent of
installers: `init()` used to ignore any non-function return, and now throws on
any non-`undefined` one. The published `I18nPlugin` type never allowed those
values (its return is a union, so TypeScript's "any return type satisfies
`void`" rule does not apply), but the runtime used to. The shape that bites is
the expression-bodied arrow — `i18n.use(() => (ready = true))` returns `true`;
write `i18n.use(() => { ready = true; })` instead.

`@comvi/core/tags` is deliberately **not** re-exported by any binding. Importing
it registers string-API tag syntax ambiently, which is a side effect no
framework entry should hand you by accident. Every `<T>` now takes the pure
`@comvi/core/rich-text` seam instead, which passes the tag grammar per call and
registers nothing — so rendering rich text never changes what plain `t()` does
with `<b>` markup, in any binding.

**One entry per package, so the entry-mixing rule is gone.** Through 0.5
development each wrapper published a root and a `/slim` subpath, which were
separate build passes and therefore separate provider/injection identities: a
provider from one could not see a hook from the other. Those subpaths never
published and no longer exist. There is nothing to pick between, and no import
path can put a second copy of a binding in your graph.

Every 0.4.x import path still resolves. What changed is the HOST those entries
construct, not the specifier you write — that is the break §0 opens with.

### `@comvi/react`

In addition to the four hook renames, React converges onto its root as the only
entry — the package publishes no subpath at all. The root is the former
single-package toolkit plus the named base `I18n` class, base `createI18n` and
`icu`: all react bindings, `icuCompiler` and `icu`, the loader/plugin/devtools
installers, and the core types. Every value is a named re-export, so one entry
means one build pass and one React context — the provider/hook identity mismatch
two entries used to make cannot happen here.
`@comvi/core/tags` is deliberately absent. `<T>` uses
`@comvi/core/rich-text` in its own dist chunk and never registers syntax
ambiently; markup passed through `t()` itself remains literal (dev warning, no
prod throw) until you `import "@comvi/core/tags"` at your own entry.

```tsx
import { createI18n, I18nProvider, loader, useI18n } from "@comvi/react";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } }).with(
  loader({ uk: () => import("./uk.json") }),
);

// <I18nProvider i18n={i18n}>…</I18nProvider>, then useI18n() / useI18nLoader() inside.
```

For inline ICU catalogs, add `compiler: icuCompiler` to that constructor call.
For remote ICU catalogs, import `icu` from `@comvi/react` — the same entry — and
compose `.with(icu())` **before** the loader; the compiler locks at first
ingestion.

Attaching a capability is not configuring it. `loader(map)` does both; the
low-level pair still splits them, and is what you want for a plain `LoaderFn`:

```tsx
import { attachLoader, createI18n } from "@comvi/react";

const i18n = createI18n({ locale: "en" }).with(attachLoader);
i18n.registerLoader(myLoader);
```

Compose neither and `useI18nLoader()` throws with the message in §5.

### `@comvi/solid`

In addition to the four hook renames, solid converges onto its root as the only
entry — the package publishes no subpath at all, and there is only one build
pass, so there is one solid context and the provider/hook identity mismatch two
entries used to make cannot happen here. The root is the former single-package
toolkit plus the named base `I18n` class, base `createI18n` and `icu`: every
reactive primitive, `<I18nProvider>`, the capability accessors, `<T>`,
`icuCompiler` and `icu`, the loader/plugin/devtools installers, and the core
types. There is no solid-side wrapper object — the host goes straight into the
provider — so `createI18n` is core's own constructor, re-exported by name.
Its provider/context types accept `WrapperI18nHost`, so a host composed to 0.4
root semantics keeps working and a base host starts working.
`@comvi/core/tags` is deliberately absent. `<T>` uses `@comvi/core/rich-text` in
its own dist chunk and never registers syntax ambiently; markup passed through
`t()` itself remains literal (dev warning, no prod throw) until you
`import "@comvi/core/tags"` at your own entry.

```tsx
import { createI18n, I18nProvider, loader, useI18n } from "@comvi/solid";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } }).with(
  loader({ uk: () => import("./uk.json") }),
);

// <I18nProvider i18n={i18n}>…</I18nProvider>, then useI18n() / useI18nLoader() inside.
```

For inline ICU catalogs, add `compiler: icuCompiler` to that constructor call.
For remote ICU catalogs, import `icu` from `@comvi/solid` — the same entry — and
compose `.with(icu())` **before** the loader; the compiler locks at first
ingestion.

Solid's capability readers are plain accessors: a capability action is an
imperative operation, not a reactive value. Compose neither capability and
`useI18nLoader()` throws with the message in §5.

### `@comvi/svelte`

In addition to the four hook renames, svelte converges onto its root as the only
entry — the package publishes no subpath at all. The root is the former
single-package toolkit plus the named base `I18n` class, base `createI18n` and
`icu`: every store factory, the capability readers, `<T>`, `icuCompiler` and
`icu`, the loader/plugin/devtools installers, and the core types. There is no
svelte-side wrapper object — the host goes straight into `setI18nContext(i18n)`
— so `createI18n` is core's own constructor, re-exported by name, and
`setI18nContext`, `getI18nContext`, `useI18n` and `<T>` are the binding modules
themselves rather than wrappers around them, which is what keeps the
`getContext` key a single object.

```svelte
<script lang="ts">
  import { createI18n, loader, setI18nContext } from "@comvi/svelte";

  const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } }).with(
    loader({ uk: () => import("./uk.json") }),
  );

  setI18nContext(i18n);
  // then useI18n() / useI18nLoader() in any descendant.
</script>
```

For inline ICU catalogs, add `compiler: icuCompiler` to that constructor call.
For remote ICU catalogs, import `icu` from `@comvi/svelte` — the same entry —
and compose `.with(icu())` **before** the loader; the compiler locks at first
ingestion.

`useI18nLoader()` / `useI18nPlugins()` are **context readers**, not stores:
callable during component initialisation only, returning plain bound functions.
Do not `$`-prefix a member. The asymmetry with `createLocaleStore()` & friends is
deliberate — a capability action is an imperative operation, not a value that
changes over time. Compose neither capability and the reader throws with the
message in §5.

`<T>` changed one import and no behaviour: it took `prepareTranslation` from
`@comvi/core/tags`, whose import registers tag syntax ambiently, and now takes it
from the pure `@comvi/core/rich-text` seam. Rendering `<T>` no longer switches
plain `t()` over to parsing `<tag>` markup; that is your own
`import "@comvi/core/tags"` from here on. `svelte-package` preserves modules, so
`dist/T.svelte` is still its own module and an app that never renders it drops
the whole rich-text path.

Svelte also gets an unrelated fix that was blocking bundlers: `dist/*.js` used to
re-export its siblings with extensionless specifiers, which strict-ESM resolvers
(webpack, Node's own loader) reject for a `"type": "module"` package. No public
API changed.

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
and `use`. `use` was the last member that was typed present on every `C` and
could still throw "missing capability" — the exact failure class this release
exists to remove — so it left with the others. Note that `i18n.core.use(...)`
returns the **host**, not the wrapper, so it no longer chains off the factory
call.

In addition to the composable renames, vue converges onto its root as the only
entry — the package publishes no subpath at all, and there is only one build
pass, so there is one `I18N_INJECTION_KEY` symbol and the plugin/composable
identity mismatch two entries used to make cannot happen here. The root is the
former single-package toolkit plus the named base `I18n` class: all three
construction paths, every composable, `<T>`, the injection key, `icuCompiler`
and `icu`, the loader/plugin/devtools installers, and the core types.
`@comvi/core/tags` is deliberately absent. `<T>` uses `@comvi/core/rich-text` in
its own dist chunk and never registers syntax ambiently; markup passed through
`t()` itself remains literal (dev warning, no prod throw) until you
`import "@comvi/core/tags"` at your own entry. That is a change in this release
— vue's `<T>` used to import the ambient entry, so rendering it anywhere also
switched tag syntax on for every plain `t()` call.

Vue is the one binding whose preset is a REAL function: there is a `VueI18n` to
construct, and `ssrLocale` has to reach the host before the reactive ref is
seeded, so the ref and `core.locale` cannot disagree for a render. All three
construction paths therefore keep distinct names, and all three ship from the
one entry:

```ts
// one call: a VueI18n over a base @comvi/core host
import { createI18n } from "@comvi/vue";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
createApp(App).use(i18n).mount("#app");
```

```ts
// composed host: `createCore` is core's own constructor, same package
import { createCore, createI18nFromCore, loader } from "@comvi/vue";

const core = createCore({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
const i18n = createI18nFromCore(core, { ssrLocale: "en" }); // i18n.core is exactly `core`
```

`createI18n(options)` keeps its 0.4.x call shape, `ssrLocale` and `compiler`
included, and returns `VueI18n<D, I18n<D>>` over the BASE `I18n`, so `i18n.core`
is typed without the capabilities it does not have. `createCore` is named after
what it builds because `createI18n` is taken by the preset; use it whenever you
want the exact-`C` `createI18nFromCore` path.

**The pipe goes on the host, one level down.** `createI18n` returns a wrapper,
not the host, so composition happens on `i18n.core` — or on the value
`createCore` handed you, which is what you want when the capability has to be in
place before a catalog is ingested:

```ts
import { createI18n, loader, plugins } from "@comvi/vue";

const i18n = createI18n({ locale: "en" });
i18n.core.with(loader({ uk: () => import("./uk.json") })).with(plugins());
```

For inline ICU catalogs, add `compiler: icuCompiler` to the `createI18n` call.
For remote ICU catalogs, import `icu` from `@comvi/vue` — the same entry — build
the host with `createCore`, and compose `.with(icu())` **before** the loader; the
compiler locks at first ingestion, and the preset ingests its `translation`
immediately, so `createI18n({ translation }).core.with(icu())` throws
`E_COMPILER_LOCKED` by construction.

### `@comvi/nuxt`

**The generated default host is the base host.** Nuxt's entries are unchanged
and `useI18n()`, `useI18nLoader()`, `useI18nPlugins()`, `<T>` and
`<NuxtLinkLocale>` are still auto-imported, so no import in your app moves. What
moved is what the module hands them: with `hostModule` unset it builds text +
`{param}` interpolation, the cache, events and default params, and nothing else.
ICU throws `E_ICU_SYNTAX`; SSR loading warns once naming the missing loader;
`i18n.core.use(...)` is not a function. Discovery is the documented residual:
the browser extension cannot see the instance until devtools is composed.

**The fix is one file.** `hostModule` is the composition escape and it is now
the mainstream path: set it, and compose exactly what the app uses.

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

Drop the lines you do not need — that is the point. Compose `loader()` and
`plugins()` before any catalog is ingested and `devtools()` last, the same
parity order every other binding uses.

| 0.4 nuxt behavior                          | after                                                              |
| ------------------------------------------ | ------------------------------------------------------------------ |
| ICU plurals in a catalog                   | `compiler: icuCompiler` in the factory's options                   |
| SSR / async translation loading            | `.with(loader(map))`                                               |
| `comvi.setup` calling `i18n.core.use(...)` | `.with(plugins())`                                                 |
| visible to the browser extension           | `.with(devtools())`                                                |
| `<tag>` in plain string-API `t()`          | `import "@comvi/core/tags"` once                                   |
| nested (non-flat) inline catalogs          | `flattenCatalog`, or `.with(loader())` which flattens on ingestion |

**New: the factory receives nuxt's resolved options.** `locale` (the render
locale on the client, the request locale on the server), `fallbackLocale`,
`defaultNs`, `defaultParams`, `tagInterpolation` from `basicHtmlTags`, `devMode`
and `apiKey` are passed in, so a composed host honours the same `nuxt.config` an
uncomposed one does. A 0.5.0-development factory that takes no argument keeps
working untouched.

**`NuxtServerHost` is the base host now**, not the loader-carrying shape it
named before; `NuxtServerLoaderHost` is the composed one, and it is what SSR
translation loading actually needs. The server utilities probe with core's
`hasLoaderApi` rather than trusting an annotation: on a host with no loader,
`loadTranslations` warns once naming `hostModule` and returns whatever the
catalog already holds, and `useTranslation` translates without touching a member
that is not there.

`comvi.setup` hooks receive a `VueI18n`, so their proxy calls move to
`i18n.core.*`. `NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` are generic in the
host and default to core's `I18n`. Annotate the hook with the host your factory
returns — `NuxtI18nSetup<I18n & I18nLoaderApi>` — and a call the host cannot
serve fails at type-check instead of at request time.

So `comvi.host.ts` is the one file in a nuxt app that names comvi specifiers,
and that is deliberate: it is the composition root the module branches on, and
reading it tells you exactly what the app pays for. Everything downstream stays
import-free.

### `@comvi/next`

The client inherits react's migration verbatim — `@comvi/next/client` re-exports
`useI18nLoader` / `useI18nPlugins` alongside `useI18n`.

**`@comvi/next` has three host entry points, and only one of them changed.**
`createNextI18n` from `@comvi/next` is preserved exactly: it composes ICU,
ambient tags, the loader with both `registerLoader` overloads, the plugin host,
nested constructor catalogs, default params and devtools discovery inside the
package, so a 0.4 app that calls it needs no migration at all. What changed is
the DIRECT-host constructor on the two runtime entries.

**`createI18n` on `@comvi/next/client` and `@comvi/next/server` is the base
host.** That name is what 0.4 published on the client, and §0's convergence
rebound it: ICU plurals now throw, the loader and plugin host are absent until
composed, discovery is invisible until installed, and nested catalogs are stored
verbatim. The §0 table is the full list, row for row; every installer it names is
re-exported from both entries, so each fix stays inside the specifier you already
import. The two entries expose the SAME constructor — the client/server split is
a runtime split, not a host-tier split — and the second constructor name that
briefly stood beside it during 0.5 development for the bare host is deleted (§3's
rename table has it; the codemod does the rename).

```tsx
"use client";
import { createI18n, I18nProvider, useI18n } from "@comvi/next/client";

// Client hosts do not load; they are hydrated from the catalog the server
// serialized, so nothing is ingested at construction.
const i18n = createI18n({ locale: "en", defaultNs: "default" });
```

**ICU timing, in the exact words that matter.** An INLINE catalog — one passed
to the constructor — is ingested immediately, so it takes the compiler in the
same call: `createI18n({ translation, compiler: icuCompiler })`. A catalog that
arrives LATER — hydrated through `<I18nProvider messages>`, or fetched by an SSR
loader — takes the installer instead, and the installer must run BEFORE the first
catalog reaches the host: `createI18n({ locale }).with(icu()).with(loader(map))`.
After any ingestion the compiler is locked and `icu()` throws own
`code === "E_COMPILER_LOCKED"` before mutating anything, so
`createI18n({ translation }).with(icu())` is invalid by construction. Clearing
translations never unlocks it. Both `icu` and `icuCompiler` are exported from
both entries, and `CompilerLockedError` types the failure.

The server gains a compose-it-yourself companion, exported from `@comvi/next/server` and
nowhere else — and that entry carries the toolkit too, because
`NextServerHost = WrapperI18nHost & I18nLoaderApi` makes the loader mandatory
for SSR and the host factory should not have to reach past next to satisfy it:

```ts
import "server-only";
import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () =>
    createI18n({ locale: "en", defaultNs: "default" }).with(
      loader({ uk: () => import("./uk.json") }),
    ),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

`@comvi/next/server` deliberately exports no composed constructor and no tag
entry: a server graph that reached for the 0.4 composed recipe would pull in ICU
and core's ambient tag-registration chunk, and the `next-server-on-default` gate
asserts neither ever arrives.

Options are routing-only; everything else belongs to the host factory. The
result is exactly `{ i18n, routing }` with no `.use*` methods. `host()` is not
called when the factory returns — the first `result.i18n` access or the first
server helper that needs the instance resolves it, exactly once, in either
order.

## 5. Capability errors you may now see

```
// development
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
// production
[comvi] missing loader capability — attach @comvi/core/loader
```

Thrown at the `useI18nLoader()` / `useI18nPlugins()` call, in both build
conditions, never silently. Either compose the capability where you build the
host (`createI18n(…).with(loader(map))`) or the lower-level attachLoader.

| symptom                                                                             | fix                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addActiveNamespace is not a function`                                              | `useI18nLoader()`                                                                                                                                                                                        |
| `reloadTranslations is not a function`                                              | `useI18nLoader()`                                                                                                                                                                                        |
| `onLoadError is not a function`                                                     | `useI18nLoader()`                                                                                                                                                                                        |
| `onMissingKey is not a function`                                                    | `useI18nPlugins()`                                                                                                                                                                                       |
| vue: `i18n.registerLoader is not a function`                                        | `i18n.core.registerLoader(…)`                                                                                                                                                                            |
| vue: `i18n.use is not a function`                                                   | `i18n.core.use(…)`                                                                                                                                                                                       |
| vue: `i18n.core.reloadTranslations` does not compile in a component                 | the inject path is host-typed by design — use `useI18nLoader()`                                                                                                                                          |
| `fetchLoader() is a .with(…) installer, not a plugin` (or `E_INSTALLER_NESTED_USE`) | you wrote `.use(fetchLoader(…))`; write `.with(fetchLoader(…))`. Nothing was installed                                                                                                                   |
| `A plugin returned a value` (or `E_PLUGIN_INIT_RETURN`)                             | a plugin returned something other than a cleanup function — usually an expression-bodied arrow (`() => (flag = true)`) or a lowercase installer reached through `.use`. Use a statement body, or `.with` |

## 6. Deliberate behavioral changes

### 6.1 `@comvi/next` server `setI18n` no longer replaces the instance

`@comvi/next`'s server `setI18n` used to let a second call replace the instance,
last write wins. It now throws — in development and in production — naming both
configuration sources:

```
[comvi/next] i18n already configured by createNextI18nFromHost(); setI18n() is a second source. Configure it once — only a same-instance setI18n() repeats.
```

`setI18n` keeps its exact public signature, and calling it again with the **same**
instance stays a no-op (setup modules commonly re-run). Configure the server i18n
from one source, once per process. Test suites that re-configured between cases
need a fresh cell: vitest and jest isolate module state per test file, and
in-repo suites use the `@internal` `_resetServerI18n()` from
`@comvi/next/dist/server/cache` — deliberately not part of the
`@comvi/next/server` public surface.

### 6.2 Three capabilities left the base core

These three left the base host, and the base host is now the root — so on a
`@comvi/core` instance they are absent until you compose them back. The 0.4
composed root had all three, and the two composed exceptions still do: the
published `createNextI18n` host and the CDN global. Together the three took the
base host from 5,563 B to **4,917 B** min+gz (of which 8 B is the `.with` pipe
added in the same release). The converged base then measures **5,016 B**: this
release adds +99 B for the loud-ICU detector, the public one-argument `I18n`
facade and the compiler-lock seam.

| what                                                  | on the base host                    | how to get it back                                                                | on a 0.4 composed root |
| ----------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| Devtools discovery (`instanceId`, `window.__COMVI__`) | absent; `instanceId` is `undefined` | `.with(devtools({ instanceId, exposeGlobal }))` from `@comvi/core/devtools`       | present                |
| `&lt;` / `&gt;` / `&amp;` / `\<` decoding             | literal text                        | any tag extension — `import "@comvi/core/tags"`, or `tagInterpolation.extensions` | present                |
| Nested catalogs in `addTranslations`                  | stored as given (dev warns)         | any loader install, or `flattenCatalog(nested)` from `@comvi/core/loader`         | present                |

**Discovery.** Browser-extension discovery is a `window` protocol, so an app
that ships no extension integration should not carry it. On a base host
`instanceId` stays `undefined` and no global is touched; `devtools(options)` and
`attachDevtools` take the same two options the 0.4 root read off `createI18n`.

**Escapes travel with the grammar they escape.** `&lt;`, `&gt;`, `&amp;` and
`\<` exist to write a literal angle bracket inside a message that IS tag
syntax. Where `<` is not syntax there is nothing to escape, so they are ordinary
characters. **ICU apostrophe quoting is unaffected** — `'{literal}'` and `''`
are core grammar and still work everywhere, the bare base host included.

**Flat catalogs.** A bare host stores catalogs verbatim; recursive flattening
belongs to the loader capability, because a loader is what hands back raw JSON.
Pass `{ "nav.home": "Home" }`, or wrap nested input once:

```ts
import { flattenCatalog } from "@comvi/core/loader";

i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) });
```

Development mode warns, with this hint, the first time a non-string leaf reaches
a host that cannot flatten it.

### 6.3 Reflection: an unassigned field is no longer an own property

`@comvi/core` is compiled with `useDefineForClassFields: false` (−191 B on every
entry). Behaviour is identical; two things change if you **enumerate or
serialize an instance**:

1. A declared-but-unassigned field is not an own property. The one public member
   this shows on is `instanceId`: on an instance that did not expose itself
   (`exposeGlobal: false`, or any server render) `Object.keys(i18n)` and
   `{ ...i18n }` no longer list it. `i18n.instanceId` still reads `undefined`.
2. Own-property order is assignment order. For the public keys that is the same
   sequence as before: `translationCache`, `apiKey`, `collectContext`,
   `devMode`, then `instanceId` when discovery assigned it.

Every public method and accessor is still a non-enumerable prototype member with
unchanged property descriptors, and a spread copy still carries data only.

## 7. What you get

Whole-app comvi graph, min+gz, framework peer dependency externalized, measured
by `node scripts/size-check.mjs`; the committed anchors live in
`scripts/size-budgets.json`. The right column is the ONE published entry from
§4 — the specifier the fixtures actually build — carrying the base host and
nothing you did not compose:

| binding         | 0.4 composed-root shape | converged default entry | saving           |
| --------------- | ----------------------- | ----------------------- | ---------------- |
| `@comvi/react`  | 10054                   | **6622**                | −3432 B (−34.1%) |
| `@comvi/solid`  | 9773                    | **6336**                | −3437 B (−35.2%) |
| `@comvi/svelte` | 9836                    | **6412**                | −3424 B (−34.8%) |
| `@comvi/vue`    | 10363                   | **6966**                | −3397 B (−32.8%) |

The left column is each package's pre-convergence root fixture, measured
2026-08-03. Vue's row is the one-call preset (`createI18n` builds a `VueI18n`
over a base host); the injected `createCore` + `createI18nFromCore` path is
measured separately as the informational `fw-vue-default-composed` row, which
measures 6962 B — 4 B under the one-call row, which is vue's preset glue, the
delta no other binding pays.

`@comvi/next` and `@comvi/nuxt` do not reduce to one before/after pair, because
each publishes more than one graph:

| graph                                                         | min+gz    | row                             |
| ------------------------------------------------------------- | --------- | ------------------------------- |
| next server, `createNextI18n` — the PRESERVED composed host   | 10120     | `fw-next-composed-factory`      |
| next server, `createNextI18nFromHost` on base + `loader()`    | **7218**  | `fw-next-server-default-loader` |
| next client, base host hydrated from the serialized catalog   | **7057**  | `fw-next-client-default`        |
| nuxt client, the generated default host                       | **8108**  | `fw-nuxt-client-default`        |
| nuxt server, `hostModule` host + the one capability SSR needs | **10017** | `fw-nuxt-server-default-loader` |
| nuxt, every capability composed — the migration ceiling       | 11648     | `fw-nuxt-full-composite`        |

Moving the next server off the composed host onto a base host plus `loader()`
saves **2902 B (−28.7%)**. The nuxt rows are deliberately NOT the old
`fw-nuxt-root` 12156 B figure re-measured: that fixture priced the
pre-convergence DEFAULT branch, which dragged a composed core in whether the app
used it or not. Today's default branch builds the base host, and
`fw-nuxt-full-composite` prices the opposite end — the capability upper bound.

Every binding also has a `<T>` rung, an inline-ICU rung and a
full-explicit-composition rung, gated the same way:

| binding                | default | + `<T>` | + inline ICU | full composition |
| ---------------------- | ------- | ------- | ------------ | ---------------- |
| `@comvi/react`         | 6622    | 8501    | 7506         | 11156            |
| `@comvi/solid`         | 6336    | 8131    | 7222         | 10791            |
| `@comvi/svelte`        | 6412    | 8603    | 7298         | 11266            |
| `@comvi/vue`           | 6966    | 8812    | 7848         | 11435            |
| `@comvi/next` (client) | 7057    | 8939    | 7936         | 11580            |

Every budget is measured + 2%, and every default row asserts — from the emitted
module graph, never from output text — that ambient tag registration and the
four unused capability subpaths never arrived. `<T>` adds the pure
`@comvi/core/rich-text` path and registers nothing, so even the `<T>` rungs keep
the tag-registration pair out. The full-composition column is the migration
CEILING for a fully composed 0.4 app rather than a parity claim: 0.4 also
registered string-API tag syntax ambiently, and that is now an explicit
`@comvi/core/tags` import which no framework entry re-exports.

Single packaging is close to free: measured against the two-package recipe
(constructor from `@comvi/core`, bindings from the framework), React measured
**+3 B** at P2; at DX-2, solid was **0 B**, svelte **+2 B** and vue **+5 B**.
The unused capability re-exports cost nothing at all — they are not in the
graph.

`.with(installer)` costs **8 B** on the base host and **7 B** on the fully
composed graph, and that is its whole price. The configured installers cost only
where they are used — see §4 for the `loader()` / `attachLoader` trade. A plugin
package's lowercase installer costs **+54 B** over composing the capabilities
yourself and calling `.use(Uppercase(…))` — measured identically on
`fetchLoader` and `localeDetector` — and the nested-use guard that makes
wrong-slot use loud is **35 B**, carried only by graphs that compose the plugin
host. Under the `production` export condition the in-context-editor installer is
a host-identity no-op and its graph carries no editor runtime at all.

Several bindings also got smaller on the **0.4 composed root** path, with no app change at
all, because `<T>` and the tag machinery it needs became opt-in and core itself got smaller: react −1240 B,
vue −1582 B.
