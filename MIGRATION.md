# Migrating to comvi 0.5.0 — framework bindings on `@comvi/core/slim`

Source version: **0.4.x** (0.5.x was never published). This release makes every
framework binding run on a bare `@comvi/core/slim` host, and that costs four
renames per binding plus, in Vue, a hop through `i18n.core`.

Everything here is mechanical. A checked-in codemod does the destructuring
shapes; the rest is a short, enumerated list of call sites it deliberately
reports instead of guessing at.

---

## 1. Why anything moved

`useI18n()` used to hand you `addActiveNamespace`, `reloadTranslations`,
`onLoadError` and `onMissingKey`. Those four are not part of the translation
core — they belong to the `@comvi/core/loader` and `@comvi/core/plugins`
capabilities. Keeping them on `useI18n()` meant the hook's return type promised
methods a slim host does not have:

- **svelte** crashed outright: `useI18n()` `.bind()`-ed them in the object
  literal it returned, so a bare-slim host threw before rendering anything.
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
| svelte/solid `getI18nContext().reloadTranslations()` / `useI18nContext().reloadTranslations()`                                                                                                      | `useI18nLoader()` inside a component, or hold your own root instance                                                                                                     |
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

A slim host used to take two packages to build: the constructor from
`@comvi/core/slim`, the bindings from `@comvi/<framework>`. 0.5.0 closes that —
every binding ships a `/slim` entry that carries the host constructor **and**
the capability toolkit, so an app names one package and nothing else:

```ts
import { createI18n, icuCompiler, loader } from "@comvi/react/slim";
//        ^ core-slim's own   ^ from @comvi/core/icu   ^ from @comvi/core/loader

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

`.with` is on every host, root and slim alike. It is a pipe and nothing more:
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
composed core-slim graph). With an import map, use `loader(map)` — you need the
adapter anyway. With a plain `LoaderFn`, use `.with(attachLoader)` and register
it yourself; that costs 2 B over calling `attachLoader(host)` directly.

Composing a capability a host **already has** is a no-op: nothing is installed,
no own property shadows the inherited prototype member, and registered state is
kept. That holds for a second `.with(loader())` on a slim host and for any
`.with(…)` on a root `@comvi/core` instance.

**Plugins on a slim host.** Published plugin packages are unchanged and work
exactly as they always have — compose the host, then `use` them:

```ts
import { createI18n } from "@comvi/core/slim";
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
- **The entry decides which core you get**, exactly as it does for `@comvi/core`
  itself: `createI18n` from `@comvi/react` builds a root host, `createI18n` from
  `@comvi/react/slim` builds a slim one. Nothing else about the name changes.

The `/slim` entries are additive. Every 0.4.x import path still resolves, and an
app that keeps building its host from `@comvi/core/slim` keeps working.

### `@comvi/react`, `@comvi/solid`, `@comvi/svelte`

Nothing but the four renames. `I18nProviderProps.i18n`, the context value types,
solid's six reactive primitives and svelte's six store factories all accept
`WrapperI18nHost` now, so root instances keep working unchanged and slim ones
start working.

There is no framework-side wrapper object in these three — the host goes
straight into the provider or the context setter — so their `/slim` preset IS
core-slim's `createI18n`, re-exported. The whole quickstart:

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
tree-shakes the root graph correctly under esbuild, vite (both modes) and
webpack production — but not under webpack _development_, where a star
re-export (`export * from "@comvi/core"`) cannot be pruned, and the retained
root entry runs core's ambient `registerTagSyntax()`. `@comvi/vue/slim` carries
the same classes, composables, `<T>` and injection key without the root-bound
`createI18n` and without the core re-export.

Vue is the one binding whose preset is a real function — there is a `VueI18n`
to construct — so `@comvi/vue/slim` exports **both** halves:

```ts
// one call: a VueI18n over a bare @comvi/core/slim host
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
import { createI18n } from "@comvi/core/slim";
import { loader } from "@comvi/core/loader";

export default () => createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
```

It is a module **path**, and the branch is taken at build time: the generated
`#build/comvi.host` template imports the root `@comvi/core` entry only when
`hostModule` is unset. Unset is the default and is unchanged. A server-rendered
app's host needs the loader capability — `NuxtServerHost = WrapperI18nHost &
I18nLoaderApi`.

`comvi.setup` hooks receive a `VueI18n`, so their proxy calls move to
`i18n.core.*`. `NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` are generic in the
host and default to the root `I18n`, so a default-configuration hook needs no
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
branches on, and seeing `@comvi/core/slim` + `loader()` there is how you
know which branch you are on. Everything downstream stays import-free.

### `@comvi/next`

The client inherits react's migration verbatim — `@comvi/next/client` re-exports
`useI18nLoader` / `useI18nPlugins` alongside `useI18n`.

**What "single package" means for next, and why it is spelled differently.**
`@comvi/next/client` is next's only client surface, and it is not a `/slim`
entry: it already exports `createI18n`, the ROOT constructor, published in
0.4.x. Swapping that binding for the slim one would silently drop ICU plurals
and tag syntax out from under an existing app, so the slim host got its own
name instead. Both are exported side by side, and the entry decides nothing —
the name does:

```tsx
"use client";
import { createSlimI18n, I18nProvider, useI18n } from "@comvi/next/client";

// Client hosts do not load; they are hydrated from the catalog the server
// serialized. `createI18n` (root) is still there if you want the full core.
const i18n = createSlimI18n({ locale: "en", defaultNs: "default" });
```

The server gains a root-free companion, exported from `@comvi/next/server` and
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

`@comvi/next/server` deliberately does **not** export a root `createI18n`: a
server graph that named the root entry would carry core's ambient tag
registration, and the `next-server-on-slim` gate asserts it never does.

Options are routing-only; everything else belongs to the host factory. The
result is exactly `{ i18n, routing }` with no `.use*` methods. `host()` is not
called when the factory returns — the first `result.i18n` access or the first
server helper that needs the instance resolves it, exactly once, in either
order.

`createNextI18n` keeps its exact signature and behavior for root apps.

## 5. Capability errors you may now see

```
// development
[comvi] This i18n instance has no loader capability. Attach it: import { attachLoader } from "@comvi/core/loader" — or use the root "@comvi/core" entry.
// production
[comvi] missing loader capability — attach @comvi/core/loader
```

Thrown at the `useI18nLoader()` / `useI18nPlugins()` call, in both build
conditions, never silently. Either compose the capability where you build the
host (`createI18n(…).with(loader(map))`) or use the root `@comvi/core` entry.

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

### 6.2 Three capabilities left the bare-slim core

Each is absent from a bare `@comvi/core/slim` graph and composed back by the
root `@comvi/core` entry, so **nothing about a root app changes**. Together they
take bare slim from 5,563 B to **4,917 B** min+gz (of which 8 B is the `.with`
pipe added in the same release).

| what                                                  | bare `@comvi/core/slim`             | how to get it back                                                                | root `@comvi/core` |
| ----------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| Devtools discovery (`instanceId`, `window.__COMVI__`) | absent; `instanceId` is `undefined` | `.with(devtools({ instanceId, exposeGlobal }))` from `@comvi/core/devtools`       | unchanged          |
| `&lt;` / `&gt;` / `&amp;` / `\<` decoding             | literal text                        | any tag extension — `import "@comvi/core/tags"`, or `tagInterpolation.extensions` | unchanged          |
| Nested catalogs in `addTranslations`                  | stored as given (dev warns)         | any loader install, or `flattenCatalog(nested)` from `@comvi/core/loader`         | unchanged          |

**Discovery.** Browser-extension discovery is a `window` protocol, so an app
that ships no extension integration should not carry it. On a bare slim host
`instanceId` stays `undefined` and no global is touched; `devtools(options)` and
`attachDevtools` take the same two options `createI18n` reads on root.

**Escapes travel with the grammar they escape.** `&lt;`, `&gt;`, `&amp;` and
`\<` exist to write a literal angle bracket inside a message that IS tag
syntax. Where `<` is not syntax there is nothing to escape, so they are ordinary
characters. **ICU apostrophe quoting is unaffected** — `'{literal}'` and `''`
are core grammar and still work everywhere, bare slim included.

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

| binding                | root host | single-package `/slim` | saving           |
| ---------------------- | --------- | ---------------------- | ---------------- |
| `@comvi/react`         | 10054     | **6532**               | −3522 B (−35.0%) |
| `@comvi/solid`         | 9773      | **6236**               | −3537 B (−36.2%) |
| `@comvi/svelte`        | 9836      | **6319**               | −3517 B (−35.8%) |
| `@comvi/vue`           | 10363     | **6880**               | −3483 B (−33.6%) |
| `@comvi/next` (server) | 9948      | **7129**               | −2819 B (−28.3%) |
| `@comvi/next` (client) | 9948      | **6964**               | −2984 B (−30.0%) |
| `@comvi/nuxt` (server) | 12156     | **9585**               | −2571 B (−21.2%) |

Single packaging is close to free: measured against the two-package recipe
(constructor from `@comvi/core/slim`, bindings from the framework), react is
**0 B**, solid **0 B**, svelte **+2 B**, vue **+5 B**, next client **+19 B**.
The unused capability re-exports cost nothing at all — they are not in the
graph.

`.with(installer)` costs **8 B** on `@comvi/core/slim` and **7 B** on the root
entry, and that is its whole price: every row above is +7…+10 B against the
same fixture before the pipe existed. The configured installers cost only where
they are used — see §4 for the `loader()` / `attachLoader` trade.

Several bindings also got smaller on the **root** path, with no app change at
all, because `<T>` and the tag machinery it needs became opt-in and core itself got smaller: react −1240 B,
vue −1582 B.
