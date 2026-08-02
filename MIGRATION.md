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

### `@comvi/react`, `@comvi/solid`, `@comvi/svelte`

Nothing but the four renames. `I18nProviderProps.i18n`, the context value types,
solid's six reactive primitives and svelte's six store factories all accept
`WrapperI18nHost` now, so root instances keep working unchanged and slim ones
start working.

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

`createI18n(options)` is unchanged and still the default. `createI18nFromCore(core, options?)`
is new, for a host you composed yourself.

**Build your slim vue app against `@comvi/vue/slim`.** The main entry
tree-shakes the root graph correctly under esbuild, vite (both modes) and
webpack production — but not under webpack _development_, where a star
re-export (`export * from "@comvi/core"`) cannot be pruned, and the retained
root entry runs core's ambient `registerTagSyntax()`. `@comvi/vue/slim` carries
the same classes, composables, `<T>` and injection key without `createI18n` and
without the core re-export.

### `@comvi/nuxt`

Set `hostModule` in `nuxt.config.ts` to opt into a composed host:

```ts
// nuxt.config.ts
comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./comvi.host.ts" }
```

```ts
// comvi.host.ts — default-export a factory returning a FRESH host per call
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";

export default () => attachLoader(createI18n({ locale: "en" }));
```

It is a module **path**, and the branch is taken at build time: the generated
`#build/comvi.host` template imports the root `@comvi/core` entry only when
`hostModule` is unset. Unset is the default and is unchanged. A server-rendered
app's host needs `attachLoader` — `NuxtServerHost = WrapperI18nHost & I18nLoaderApi`.

`comvi.setup` hooks receive a `VueI18n`, so their proxy calls move to
`i18n.core.*`. `NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` are generic in the
host and default to the root `I18n`, so a default-configuration hook needs no
annotation.

### `@comvi/next`

The client inherits react's migration verbatim — `@comvi/next/client` re-exports
`useI18nLoader` / `useI18nPlugins` alongside `useI18n`.

The server gains a root-free companion, exported from `@comvi/next/server` and
nowhere else:

```ts
import "server-only";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { createNextI18nFromHost } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () => {
    const host = attachLoader(createI18n({ locale: "en", defaultNs: "default" }));
    host.registerLoader(myLoader);
    return host;
  },
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

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
host (`attachLoader(createI18n(…))`) or use the root `@comvi/core` entry.

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
take bare slim from 5,563 B to **4,909 B** min+gz.

| what                                                  | bare `@comvi/core/slim`             | how to get it back                                                                | root `@comvi/core` |
| ----------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| Devtools discovery (`instanceId`, `window.__COMVI__`) | absent; `instanceId` is `undefined` | `attachDevtools(i18n, { instanceId, exposeGlobal })` from `@comvi/core/devtools`  | unchanged          |
| `&lt;` / `&gt;` / `&amp;` / `\<` decoding             | literal text                        | any tag extension — `import "@comvi/core/tags"`, or `tagInterpolation.extensions` | unchanged          |
| Nested catalogs in `addTranslations`                  | stored as given (dev warns)         | `attachLoader`, or `flattenCatalog(nested)` from `@comvi/core/loader`             | unchanged          |

**Discovery.** Browser-extension discovery is a `window` protocol, so an app
that ships no extension integration should not carry it. On a bare slim host
`instanceId` stays `undefined` and no global is touched; `attachDevtools` takes
the same two options `createI18n` reads on root.

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
by `node scripts/size-check.mjs`:

| binding                | root host | bare `/slim` host | saving           |
| ---------------------- | --------- | ----------------- | ---------------- |
| `@comvi/react`         | 10038     | **6515**          | −3523 B (−35.1%) |
| `@comvi/solid`         | 9756      | **6222**          | −3534 B (−36.2%) |
| `@comvi/svelte`        | 9818      | **6300**          | −3518 B (−35.8%) |
| `@comvi/vue`           | 10348     | **6857**          | −3491 B (−33.7%) |
| `@comvi/next` (server) | 9930      | **7059**          | −2871 B (−28.9%) |
| `@comvi/nuxt` (server) | 12140     | **9568**          | −2572 B (−21.2%) |

Several bindings also got smaller on the **root** path, with no app change at
all, because `<T>` and the tag machinery it needs became opt-in and core itself got smaller: react −1240 B,
vue −1582 B.
