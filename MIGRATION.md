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

| 0.4 root behaviour                           | converged root                | loudness                                | migration                                                                 |
| -------------------------------------------- | ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| ICU plurals / select                         | the default compiler throws   | **dev AND prod throw** `E_ICU_SYNTAX`   | inline: `compiler: icuCompiler`; remote: `.with(icu())` before the loader |
| `.use(plugin)`                               | absent                        | TS error + runtime `TypeError`          | `.with(plugins()).use(p)`                                                 |
| loader (`registerLoader`, …)                 | absent                        | existing loud capability error          | `.with(loader())` / `fetchLoader(opts)`                                   |
| discovery (`instanceId`, `window.__COMVI__`) | absent                        | invisible to the extension (documented) | `.with(devtools())`, or the in-context-editor installer                   |
| nested catalogs                              | stored verbatim               | dev warning                             | `flattenCatalog(…)`, or compose `loader()`                                |
| string-API tags (`"<b>hi</b>"`)              | literal text                  | dev warning; prod literal               | `<T>`, or `import "@comvi/core/tags"`                                     |
| `new I18n(options)`                          | unchanged, one argument       | —                                       | —                                                                         |
| published `createNextI18n`                   | unchanged composed host       | —                                       | —                                                                         |
| the CDN global                               | unchanged, batteries-included | —                                       | —                                                                         |

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
the installer throws. No cache is ever cleared or rekeyed — the lock is what
proves no compiled template can exist yet.

### 0.2 The ICU failure is structured, and its context is yours

`E_ICU_SYNTAX` owns exactly `code` and a truthful `argumentType` (`"plural"`,
`"select"`, `"selectordinal"`, or the parsed token such as `"number"` / `"date"`
/ `"other"`, for which the message explicitly does NOT claim shipped ICU
support) — and nothing else. **Locale, namespace, key and catalog source are
application-supplied telemetry**, not core-error fields: core does not know
which of your loaders produced the catalog, and inventing a field it cannot fill
truthfully would cost every user bytes. Combine the two at your boundary:

```ts
try {
  return i18n.t(key, params);
} catch (error) {
  if ((error as { code?: string }).code === "E_ICU_SYNTAX") {
    report(error, { locale: i18n.locale, namespace, key, source: "cdn-catalog" });
  }
  throw error;
}
```

Development is **eager**: ingesting a catalog walks its string leaves, so a bad
template throws where it entered. Production is **lazy and non-cached**: the
throw lands on the first render of that template, and every later call re-throws
rather than serving something wrong. The dev walk costs the production bundle
**0 B**.

### 0.3 Residuals — named, not solved

- **String-API tags without a tag extension render literally.** Statically
  indistinguishable from text, so there is a dev warning and no prod throw. In a
  UI review a literal `<b>` is visibly broken, unlike a plausible-looking plural.
- **Discovery is invisible until installed.** An app on the base host is not
  picked up by the browser extension until it composes `devtools()` or the
  in-context-editor installer.
- **Nested catalogs are stored verbatim** on a host without the loader
  capability (dev-warned). `flattenCatalog` is the pure escape hatch.
- **Runtime-loaded ICU catalogs** convert from "works" to "throws" until the
  host installs an ICU-capable compiler pre-ingestion. Deliberately loud.
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

It rewrites pure, mixed, aliased and repeated destructures, drops the now-illegal
namespace argument from the capability call, merges into a capability destructure
that already exists in the same function, maintains the import statement (adding
the hooks, removing an orphaned `useI18n`), and reads `.vue` / `.svelte` script
blocks with position remapping. Running it twice is a byte-identical no-op.

**It never rewrites silently.** These shapes are reported — sorted by
`path:line:column`, as a human list and as JSON — and left alone:

- rest spreads (`const { t, ...rest } = useI18n()`)
- computed member access
- a hook result stored in a variable (`const bag = useI18n(); bag.reloadTranslations()`)
- a hook result crossing a function boundary
- a local name that would collide with the hook the codemod wants to introduce
- `useI18n` imported from a relative path or a nuxt auto-import (the driver will
  not guess where the capability API lives — reported as `manual-import`)
- `.vue` / `.svelte` script blocks that fail extraction
- the eight dropped `VueI18n` instance proxies, in `.vue` files and
  `comvi.setup.*` modules: `i18n.reloadTranslations()` may be a `VueI18n`
  (migrate to `i18n.core.*`) or a raw core instance (already correct), and the
  receiver's type is textually undecidable

## 4. Per binding

### One package per app

A host used to take two packages to build: the constructor from
`@comvi/core`, the bindings from `@comvi/<framework>`. 0.5.0 closes that —
every binding ships a `/slim` entry that carries the host constructor **and**
the capability toolkit, so an app names one package and nothing else:

```ts
import { createI18n, icuCompiler, loader } from "@comvi/react/slim";
//        ^ core's own constructor  ^ from @comvi/core/icu   ^ from @comvi/core/loader

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
```

| binding         | single-package specifier | host constructor                       |
| --------------- | ------------------------ | -------------------------------------- |
| `@comvi/react`  | `@comvi/react/slim`      | `createI18n`                           |
| `@comvi/solid`  | `@comvi/solid/slim`      | `createI18n`                           |
| `@comvi/svelte` | `@comvi/svelte/slim`     | `createI18n`                           |
| `@comvi/vue`    | `@comvi/vue/slim`        | `createI18n` (one-call) / `createCore` |
| `@comvi/next`   | `@comvi/next/client`     | `createSlimI18n`                       |
| `@comvi/next`   | `@comvi/next/server`     | `createSlimI18n`                       |
| `@comvi/nuxt`   | auto-imported            | see the nuxt section                   |

Eight bindings are re-exported on every one of those entries — `icuCompiler`,
`loader`, `plugins`, `devtools`, `attachLoader`, `flattenCatalog`,
`attachPlugins`, `attachDevtools`. They are **named** re-exports of core's own
bindings (`slim.loader === loader`), so the ones you do not call are pruned:
the `*-slim-preset` bundler-matrix cases assert the icu, plugins and devtools
subpaths never enter the module graph, in webpack and vite, development and
production.

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

**Plugins on a composed host.** Published plugin packages are unchanged and work
exactly as they always have — compose the host, then `use` them:

```ts
import { createI18n } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(loader()).with(plugins());
i18n.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/my-project" }));
await i18n.init();
```

`loader()` before `plugins()` when a plugin registers a loader — plugins run at
`init()`, and `registerLoader` has to exist by then. This is the current
recipe, not the final one: plugin packages will become directly `.with`-able in
a follow-up, and `.with`'s signature is already wide enough to take them.

`@comvi/core/tags` is deliberately **not** re-exported. Importing it registers
tag syntax ambiently, which is a side effect no entry should hand you by
accident; `<T>` owns that import and lives in its own dist chunk. Nothing about
`<T>` changes — keep importing it from your binding.

Two rules if you use these entries:

- **Pick one entry per app.** `@comvi/react` and `@comvi/react/slim` (and the
  solid and vue pairs) are separate build passes, so their provider/injection
  identities are distinct objects. A provider from one and a hook from the other
  will not see each other. The `/slim` entry is a superset of the bindings, so
  there is never a reason to mix. (`@comvi/svelte` preserves modules and
  `@comvi/next` has a single client entry, so neither can hit this.)
- **The entry decides which graph you get, not which host.** `createI18n` is
  core's one base-host constructor, re-exported by `@comvi/react` and by
  `@comvi/react/slim` alike; the slim entry differs by dropping the rest of the
  core re-exports and adding the capability toolkit beside the bindings. The
  instance you get is the same object either way.

The `/slim` entries are additive. Every 0.4.x import path still resolves, and an
app that keeps building its host from `@comvi/core` keeps working.

### `@comvi/react`, `@comvi/solid`, `@comvi/svelte`

Nothing but the four renames. `I18nProviderProps.i18n`, the context value types,
solid's six reactive primitives and svelte's six store factories all accept
`WrapperI18nHost` now, so a host composed to 0.4 root semantics keeps working
unchanged and a base host starts working.

There is no framework-side wrapper object in these three — the host goes
straight into the provider or the context setter — so their `/slim` preset IS
core's own `createI18n`, re-exported. The whole quickstart:

```tsx
import { createI18n, I18nProvider, loader, useI18n } from "@comvi/react/slim";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } }).with(
  loader({ uk: () => import("./uk.json") }),
);

// <I18nProvider i18n={i18n}>…</I18nProvider>, then useI18n() / useI18nLoader() inside.
```

Solid is identical. Svelte swaps the provider for `setI18nContext(i18n)` and
imports from `@comvi/svelte/slim`.

Attaching a capability is not configuring it. `loader(map)` does both; the
low-level pair still splits them, and is what you want for a plain `LoaderFn`:

```tsx
import { attachLoader, createI18n } from "@comvi/react/slim";

const i18n = createI18n({ locale: "en" }).with(attachLoader);
i18n.registerLoader(myLoader);
```

Compose neither and `useI18nLoader()` throws with the message in §5.

Svelte's `useI18nLoader()` / `useI18nPlugins()` are **context readers**, not
stores: callable during component initialisation only, returning plain bound
functions. Do not `$`-prefix a member. Solid's are plain accessors — a capability
action is an imperative operation, not a reactive value.

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

`createI18n(options)` is unchanged and still the default on `@comvi/vue`.
`createI18nFromCore(core, options?)` is new, for a host you composed yourself.

**Build your slim vue app against `@comvi/vue/slim`.** The main entry
tree-shakes core out of a `createI18nFromCore`-only app under esbuild, vite
(both modes) and webpack production — but not under webpack _development_,
where a star re-export (`export * from "@comvi/core"`) cannot be pruned, so the
whole core entry and vue's own `createI18n` stay in the bundle.
`@comvi/vue/slim` carries the same classes, composables, `<T>` and injection
key with no `export *` at all, and keeps its one-call preset in a construction
module of its own, so a development bundle holds only the bindings the app
actually names. The base `@comvi/core` module is not what it drops —
`createI18n` and `createCore` both resolve to it, so it is in every graph that
constructs a host. What `/slim` drops is the broad `I18n`/star re-export
surface, `@comvi/core/tags`, and any capability subpath the app never calls.

Vue is the one binding whose preset is a real function — there is a `VueI18n`
to construct — so `@comvi/vue/slim` exports **both** halves:

```ts
// one call: a VueI18n over a bare @comvi/core host
import { createI18n } from "@comvi/vue/slim";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi" } } });
createApp(App).use(i18n).mount("#app");
```

```ts
// composed host: `createCore` is core's own constructor, same package
import { createCore, createI18nFromCore, loader } from "@comvi/vue/slim";

const core = createCore({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
const i18n = createI18nFromCore(core, { ssrLocale: "en" });
```

The one-call preset's host takes the pipe too — it is `i18n.core`.

`createI18n` here takes the same options as `@comvi/vue`'s, `ssrLocale`
included, plus `compiler` — so `compiler: icuCompiler` from the same import
buys ICU back. The wrapper it returns is `VueI18n<D, I18n<D>>` over the SLIM
`I18n`, so `i18n.core` is typed without the capabilities it does not have.
`createCore` is named after what it builds because `createI18n` is taken by the
one-call preset; use it whenever you want the exact-`C` `createI18nFromCore`
path.

### `@comvi/nuxt`

Set `hostModule` in `nuxt.config.ts` to opt into a composed host:

```ts
// nuxt.config.ts
comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./comvi.host.ts" }
```

```ts
// comvi.host.ts — default-export a factory returning a FRESH host per call
import { createI18n } from "@comvi/core";
import { loader } from "@comvi/core/loader";

export default () => createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
```

It is a module **path**, and the branch is taken at build time: the generated
`#build/comvi.host` template imports `@comvi/core` directly only when
`hostModule` is unset. Unset is the default and is unchanged. A server-rendered
app's host needs the loader capability — `NuxtServerHost = WrapperI18nHost &
I18nLoaderApi`.

`comvi.setup` hooks receive a `VueI18n`, so their proxy calls move to
`i18n.core.*`. `NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` are generic in the
host and default to core's `I18n`, so a default-configuration hook needs no
annotation.

**Why nuxt has no `/slim` entry, and does not need one.** In a nuxt app you
never import the bindings at all — `useI18n()`, `useI18nLoader()` and
`useI18nPlugins()` are auto-imported by the module, so app code already names
zero packages. What is left is the host, and a host in nuxt is not app code: it
is a build-time template branch selected by a module OPTION, and `hostModule`
is a PATH the module resolves and inlines into `#build/comvi.host`. A `/slim`
entry could not participate in that — the generated template is what decides
which core is imported, and it decides before any of your imports exist.

So `comvi.host.ts` is the one file in a nuxt app that names `@comvi/core`
specifiers, and that is deliberate: it is the composition root the module
branches on, and seeing `@comvi/core` + `loader()` there is how you
know which branch you are on. Everything downstream stays import-free.

### `@comvi/next`

The client inherits react's migration verbatim — `@comvi/next/client` re-exports
`useI18nLoader` / `useI18nPlugins` alongside `useI18n`.

**What "single package" means for next, and why there are two names.**
`@comvi/next/client` is next's only client surface. It published `createI18n`
(0.4's batteries-included constructor) and later added `createSlimI18n` for the
bare host, because rebinding the first name would have silently dropped ICU
plurals and tag syntax out from under an existing app. Since §0 made the bare
host THE host, both names now denote the same base constructor — a later phase
deletes the duplicate and codemods the name. Compose what you need either way:

```tsx
"use client";
import { createSlimI18n, I18nProvider, useI18n } from "@comvi/next/client";

// Client hosts do not load; they are hydrated from the catalog the server
// serialized. `createI18n` is still exported and denotes the same constructor.
const i18n = createSlimI18n({ locale: "en", defaultNs: "default" });
```

The server gains a compose-it-yourself companion, exported from `@comvi/next/server` and
nowhere else — and that entry carries the toolkit too, because
`NextServerHost = WrapperI18nHost & I18nLoaderApi` makes the loader mandatory
for SSR and the host factory should not have to reach past next to satisfy it:

```ts
import "server-only";
import { createNextI18nFromHost, createSlimI18n, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () =>
    createSlimI18n({ locale: "en", defaultNs: "default" }).with(
      loader({ uk: () => import("./uk.json") }),
    ),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

`@comvi/next/server` deliberately exports no batteries-included constructor and
no tag entry: a server graph that reached for the 0.4 composed recipe would pull
in ICU and core's ambient tag-registration chunk, and the `next-server-on-slim`
gate asserts neither ever arrives.

Options are routing-only; everything else belongs to the host factory. The
result is exactly `{ i18n, routing }` with no `.use*` methods. `host()` is not
called when the factory returns — the first `result.i18n` access or the first
server helper that needs the instance resolves it, exactly once, in either
order.

`createNextI18n` keeps its exact signature and behavior — `@comvi/next` now
composes that graph explicitly inside the package instead of inheriting it.

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

| symptom                                                             | fix                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `addActiveNamespace is not a function`                              | `useI18nLoader()`                                               |
| `reloadTranslations is not a function`                              | `useI18nLoader()`                                               |
| `onLoadError is not a function`                                     | `useI18nLoader()`                                               |
| `onMissingKey is not a function`                                    | `useI18nPlugins()`                                              |
| vue: `i18n.registerLoader is not a function`                        | `i18n.core.registerLoader(…)`                                   |
| vue: `i18n.use is not a function`                                   | `i18n.core.use(…)`                                              |
| vue: `i18n.core.reloadTranslations` does not compile in a component | the inject path is host-typed by design — use `useI18nLoader()` |

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
added in the same release).

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
by `node scripts/size-check.mjs` at the DX-2 commit. The `/slim` column is
the SINGLE-PACKAGE recipe from §4 — the one the fixtures actually build:

| binding                | 0.4 composed root | single-package `/slim` | saving           |
| ---------------------- | ----------------- | ---------------------- | ---------------- |
| `@comvi/react`         | 10054             | **6532**               | −3522 B (−35.0%) |
| `@comvi/solid`         | 9773              | **6236**               | −3537 B (−36.2%) |
| `@comvi/svelte`        | 9836              | **6319**               | −3517 B (−35.8%) |
| `@comvi/vue`           | 10363             | **6880**               | −3483 B (−33.6%) |
| `@comvi/next` (server) | 9948              | **7129**               | −2819 B (−28.3%) |
| `@comvi/next` (client) | 9948              | **6964**               | −2984 B (−30.0%) |
| `@comvi/nuxt` (server) | 12156             | **9585**               | −2571 B (−21.2%) |

Single packaging is close to free: measured against the two-package recipe
(constructor from `@comvi/core`, bindings from the framework), react is
**0 B**, solid **0 B**, svelte **+2 B**, vue **+5 B**, next client **+19 B**.
The unused capability re-exports cost nothing at all — they are not in the
graph.

`.with(installer)` costs **8 B** on the base host and **7 B** on the fully
composed graph, and that is its whole price: every row above is +7…+10 B against the
same fixture before the pipe existed. The configured installers cost only where
they are used — see §4 for the `loader()` / `attachLoader` trade.

Several bindings also got smaller on the **0.4 composed root** path, with no app change at
all, because `<T>` and the tag machinery it needs became opt-in and core itself got smaller: react −1240 B,
vue −1582 B.
