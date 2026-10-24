# @comvi/react

## 0.7.0

### Patch Changes

- @comvi/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
- Updated dependencies [1fb2046]
  - @comvi/core@0.6.0

## 0.5.0

### Minor Changes

- 09029b0: **BREAKING (breaking change on a 0.x minor): the per-call `raw` option is renamed `markers`, with
  the polarity inverted.** `t('meta.title', { raw: true })` becomes `t('meta.title', { markers: false })`.
  Core never read the option; its one reader is the in-context editor, which appends invisible
  marker characters to every result so it can find the text on the page. `markers: false` turns
  those characters off for this call, for when they cause a problem: a comparison or sort that sees
  extra characters, a width-sensitive layout, a canvas or library that counts characters. The new
  name says exactly that; nothing else reads it, and the string is then not editable in context. Leaving it out, or passing `true`, keeps the markers
  as before. `markers` stays a reserved call-control key: it is not an interpolation value, and
  `defaultParams` rejects it beside `locale`, `ns`, `fallback` and `tagInterpolation`.

  **On `<T>` the prop is `markers` too, in all four bindings.** `<T raw>` becomes
  `<T markers={false}>` in JSX and `.svelte` markup and `:markers="false"` in `.vue` templates.
  `<T>` forwards `markers: false` only when the prop is `false`; `true` or no prop adds nothing, so
  a `markers` key in `params` is left as it is. `raw` is an undeclared name on `<T>`, so like
  any other undeclared prop it reaches the translation as an interpolation param.

- 09029b0: **BREAKING (breaking change on a 0.x minor):** `@comvi/react` runs on a base `@comvi/core` instance,
  and the four loader/plugin members left `useI18n()` for two dedicated hooks.

  | 0.4.x                                                                   | 0.5.0                                                              |
  | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
  | `const { addActiveNamespace, reloadMessages, onLoadError } = useI18n()` | the same names, plus `addActiveNamespaces`, from `useI18nLoader()` |
  | `const { onMissingKey } = useI18n()`                                    | `const { onMissingKey } = useI18nPlugins()`                        |
  | `const { t, reloadMessages } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; `useI18nLoader()` takes no argument     |

  **Why the members moved.** `useI18n()` used to bind them eagerly, so the hook could not run
  at all on an instance without the loader/plugin capability, and its return type promised methods
  that instance does not have. They are acquired explicitly now, and an instance that lacks the
  capability fails at that one call with a message naming the fix — in development **and** in
  production, never a silent no-op. The bag `useI18nLoader()` / `useI18nPlugins()` return is
  referentially stable per instance.

  `<T>` ships as its own dist chunk with a `/*@__PURE__*/` memo wrapper, taking
  `prepareTranslation` from the pure `@comvi/core/rich-text` seam, so an app that never
  renders it drops the whole rich-text path and one that does never executes tag registration.
  `I18nProviderProps.i18n` and both context value types accept `WrapperI18nInstance` instead of
  the concrete `I18n` class, so any composition of the base instance fits. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md).

- 09029b0: **BREAKING (breaking change on a 0.x minor): `createI18n` from `@comvi/react` now builds the base instance.** `@comvi/react` has re-exported core's `createI18n` and `I18n` by name since 0.4, and in 0.4 that constructor arrived with ICU, tag syntax, async loading, the plugins capability and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

  **Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/react/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported, and it never published, so there is no deprecation debt.

  Nothing about `<I18nProvider>`, `useI18n()`, `<T>`, the selector hooks or the capability
  hooks changes here; this is the instance underneath them, and the packaging half is in
  `react-single-package-slim.md`. Compose what you had back — every installer is re-exported
  from `@comvi/react`, so each fix stays inside the one specifier you already have:

  | you had                                      | you add                                            |
  | -------------------------------------------- | -------------------------------------------------- |
  | ICU plurals, select, selectordinal           | `compiler: icuCompiler` in the constructor options |
  | loader (`registerLoader`, …)                 | `.use(loader(map))`, or `.use(attachLoader)`       |
  | `.use(plugin)`, `onMissingKey`               | `.use(definePlugin(p))`, or `registerPlugin(p)`    |
  | discovery (`instanceId`, `window.__COMVI__`) | `.use(devtools({ instanceId }))`                   |
  | `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`       |

  ```tsx
  import { createI18n, icuCompiler, loader } from "@comvi/react";

  // INLINE — the constructor ingests the catalog.
  const inline = createI18n({ locale: "en", compiler: icuCompiler, messages });
  // REMOTE — the same option, in the same place.
  const remote = createI18n({ locale: "en", compiler: icuCompiler }).use(loader(importMap));
  ```

  `compiler` is a constructor field held for the instance's life, so one option covers every
  catalog source, and nothing about composition is ordered.

  Residual: `t("Click <b>here</b>")` returns that markup as text, because no entry registers
  tag syntax ambiently — development warns the first time, production stays literal and never
  throws. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §3 and
  `core-single-entry-convergence.md`.

- 09029b0: **BREAKING (breaking change on a 0.x minor): the `attachPlugins` / `attachDevtools` low-level pair is no longer re-exported
  from `@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`, or the `@comvi/next`
  `client`/`server`/root entries.** They were synonyms for what `plugins()` / `devtools()`
  already configure, so a binding user now sees exactly `loader`, `attachLoader`, `plugins`,
  `devtools`, `definePlugin` on the root — the everyday toolkit. The advanced pair still
  lives on `@comvi/core/plugins` and `@comvi/core/devtools` for anyone composing a bare
  `.use(attachPlugins)` / `.use(attachDevtools)` directly:

  ```diff
  -import { attachPlugins, attachDevtools } from "@comvi/react";
  +import { attachPlugins } from "@comvi/core/plugins";
  +import { attachDevtools } from "@comvi/core/devtools";
  ```

- 09029b0: **BREAKING (breaking change on a 0.x minor): `I18n` is a TYPE-only export from the four binding roots.** `createI18n(options)` and `new I18n(options)` build the same object, so the class VALUE is `@comvi/core`'s to export; `export type { I18n }` stays on every root for typing an instance you compose. A `new I18n(…)` through `@comvi/react`, `@comvi/solid`, `@comvi/svelte` or `@comvi/vue` is now a type error — import the class from `@comvi/core`, or call `createI18n`.
- 09029b0: **Security: a translation param that only looks like a node is rendered as text.** Core decided
  whether a param was a virtual node from its shape, and every `<T>` then rendered it as an element
  with its own tag and props. A plain object of that shape, such as a value from an API response
  or a URL passed as `name`, became a real element chosen by whoever sent the data.

  Nodes are now recognised by a mark, not by shape. `createElement`, `createTextNode` and
  `createFragment` brand what they return with a non-enumerable `Symbol.for("comvi.node")`
  property, which `JSON.parse` cannot produce and neither `JSON.stringify` nor `structuredClone`
  carries. `isVirtualNode()` is true only for a branded node, core passes only branded nodes and
  React elements (a symbol `$$typeof`) through interpolation, and all four `<T>` converters render
  anything else as text at every depth.

  **BREAKING (breaking change on a 0.x minor):** an object literal such as
  `{ type: 'element', tag: 'b', props: {}, children }` is no longer a node, and neither is a spread
  copy of one. Build nodes with the factories, including in a tag callback's return value. A Vue
  VNode passed as a param is text as well: its `__v_isVNode` marker is a plain boolean that data can
  carry, and `<T>` never rendered one correctly; use a slot or the `components` prop.

  Also fixed: `{constructor}` or `<valueOf>` in a message no longer resolves to the member every
  object inherits. A placeholder with no own param of that name is a missing param, and such a tag
  has no handler.

- 09029b0: A nested inline catalog now works on every instance, and `flattenCatalog` stops being an escape hatch.

  `createI18n({ messages: { en: { nav: { home: "Home" } } } })` type-checked before, warned once in
  development, and then resolved every key under `nav` as missing in production — because flattening
  was an optional capability hook (`_flattenNs`) that only an instance with the loader composed installed, and a base
  instance stored the nested object as if it were flat. `addMessages()` had the same hole.

  Flattening now happens in the BASE instance, unconditionally, at the one place a catalog enters. Nested
  objects and flat dotted keys are the same catalog everywhere — in the constructor, in
  `addMessages()`, and in a loader result — and a mixed object carrying both works too. With that,
  two things are gone:
  - the dev warning that told you a base instance "stores catalogs as given";
  - `flattenCatalog` as the answer to that rule. It is still exported, from the `@comvi/core` ROOT
    only, for pre-flattening data by hand.

  Non-string leaves now behave identically on every instance, as they already did on the loader path:
  coerced with `String()`, and `null`/`undefined` leaves dropped with a dev warning. On a base instance a
  `null` leaf used to be stored verbatim and resolve as an empty template.

  MIGRATION — `flattenCatalog` is no longer re-exported from the loader subpath
  (`@comvi/core/loader`), nor from the `@comvi/react`, `@comvi/solid`, `@comvi/svelte`,
  `@comvi/vue`, `@comvi/next/client` and `@comvi/next/server` roots. In almost every case the
  call can simply be deleted:

  ```diff
  -import { createI18n } from "@comvi/react";
  -import { flattenCatalog } from "@comvi/react";
  +import { createI18n } from "@comvi/react";

  -createI18n({ locale: "en", messages: { en: flattenCatalog({ nav: { home: "Home" } }) } });
  +createI18n({ locale: "en", messages: { en: { nav: { home: "Home" } } } });
  ```

  If you still want the function itself — to inspect the keys a catalog will produce, or to merge
  several sources before handing one object over — import it from `@comvi/core`:

  ```ts
  import { flattenCatalog } from "@comvi/core";
  ```

  Also: `init()` now warns once, in development only, when an option was passed whose capability was
  never composed — `ns` without the loader (naming `.use(loader(map))`), and `instanceId` /
  `exposeGlobal: true` without discovery (naming `.use(devtools({ instanceId }))`). Both used to do
  nothing and say nothing. Production stays silent.

- 09029b0: ICU is enabled ONLY through the constructor option `compiler: icuCompiler`

  The `icu()` installer is removed, together with the compiler lock behind it: the
  `E_COMPILER_LOCKED` error, its `CompilerLockedError` type and the
  `_setCompilerBeforeIngestion` seam are gone. `icuCompiler` and the
  `MessageCompiler` type stay where they were, on `@comvi/core/icu` and re-exported
  by every binding root.

  ICU is a compiler setting, not a capability with an API. Two enable forms whose
  validity depended on where the catalog came from — `compiler:` for inline
  catalogs, `.use(icu())` for remote ones, `E_COMPILER_LOCKED` when mixed — was a
  rule readers had to learn for no benefit. One constructor option works
  everywhere: inline, loader, CDN, API.

  ```ts
  import { createI18n, icuCompiler } from "@comvi/vue"; // or react/solid/svelte/next client/core
  const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(cdnLoader({ cdnUrl }));
  ```

  Nothing else about composition changes, and no ordering rule is left in the
  library. `.use(loader())`, `.use(plugins())`, `.use(devtools())` and a
  plugin's own installer compose in any order. Vue keeps its own rule, which is
  about the plugin queue rather than ICU: compose before `app.use(i18n)`. Nuxt's
  `comvi.icu: true` already maps to `compiler: icuCompiler` and is unchanged.

  Two smaller consequences. The development `E_ICU_SYNTAX` message now ends with
  `Pass compiler: icuCompiler from "@comvi/core/icu" in the constructor options.`,
  so anything asserting on the old hint text needs updating. And the production
  error inventory shrinks by one here: after this change the identities that carry
  a branchable `code` are `E_ICU_SYNTAX` and, on the Vue wrapper,
  `E_USE_INSTANCE_IDENTITY`. `E_USE_NOT_INSTALLER` joins them with the `.use(installer)`
  verb.

  Migration: replace `createI18n(options).use(icu())` with
  `createI18n({ ...options, compiler: icuCompiler })` and drop the `icu` import.
  Code that branched on `code === "E_COMPILER_LOCKED"` has nothing left to catch.

- 09029b0: **`<I18nProvider fallback>` gates the first paint.** Neither provider used to gate it, each README prescribed a different loading gate, and every CDN quickstart as written painted raw keys once before the catalog arrived. `fallback` — `ReactNode` in react, `JSX.Element` in solid — renders instead of the children until the instance is INITIALIZED, and the children replace it when initialization finishes. The axis is `isInitialized` (the same instance state `useI18n().isInitialized` reads), deliberately not `isInitializing`: `init()` starts from an effect, after the first render, so a gate on "is it initializing" is open for exactly the frame the raw keys would paint in. With `autoInit: false` the gate therefore holds until the app calls `i18n.init()` itself. Both branches render inside the provider, so the fallback may use the hooks. React's server snapshot keeps its contract — `ssrInitialIsInitializing` is `false` by default, so a server render is never gated and the hydration render reads that same snapshot; solid has no such snapshot, so `renderToString` (where no effect runs) paints the fallback, hydrates it consistently, and swaps once the client instance initializes. `fallback={undefined}` is the same as omitting it in BOTH bindings — the gate is
  `fallback !== undefined`, so a wrapper that forwards its own optional prop does not turn into a
  blank gate — while `fallback={null}` still is one. React's server render is not gated by default;
  pass `ssrInitialIsInitializing={true}` beside `fallback` to gate it, which is the recipe for a
  server render whose catalog is not in yet (`@comvi/next` passes `false` for you, so a `fallback`
  there is a post-hydration gate only). Purely additive — omit the prop and the rendered tree is
  what it was. Svelte has no provider component and vue's equivalent is a `<Suspense>`-shaped question; both document the three-line `{#if $isInitializing}` / `v-if="isInitializing"` gate in their README instead of growing an API, which is sound there because both start init synchronously before the first paint.
- 09029b0: **One name for the SSR render locale: `ssrLocale`.** `@comvi/solid` had no way to seed one, though it has `renderToString` and hydration, so a server render could only ever paint the instance's configured locale and the hydrating client silently disagreed with it until the first reactive update repainted. `<I18nProvider ssrLocale="fr">` now adopts that locale onto the instance during the render phase, before the locale signal is seeded — the same contract `@comvi/vue`'s option of that name has, and the reason `t()` and `locale()` cannot drift apart. Adopting it is a WRITE to `i18n.locale`, so a solid app that server-renders must build its instance inside the request handler: a module-scope instance shared by every concurrent request would carry one request's locale into another's tree. The package README's SSR section shows the per-request shape. **BREAKING (breaking change on a 0.x minor): `@comvi/react`'s render-locale prop is `ssrLocale` too**, the one cross-binding name; `ssrInitialLocale` is removed. React's `ssrInitialIsLoading` / `ssrInitialIsInitializing` are deliberately not ported — they exist for `useSyncExternalStore`'s server snapshot and are correctly react-only. `@comvi/next`'s own client provider passes `ssrLocale` internally and omits it from its own provider props, since it sets the render locale from its own `locale` prop and an `ssrLocale` passed there would be silently overridden.
- 09029b0: `useI18n()` consumers now re-render on the full canonical 7-event revision set via core's
  `subscribeToRevision`, where they used to see a hand-copied 5-event subset (`localeChanged`
  and `loadingStateChanged` were observable only through the provider contexts). The internal
  `useStoreRevision(i18n)` always subscribes to the canonical set, and its content-addressed
  snapshot now includes the locale and loading axes, so any state-changing canonical event is
  re-render-visible regardless of subscription timing. The narrow per-axis selector hooks
  (`useLocale`, `useIsLoading`) keep their minimal subscriptions.

  Internal dedupe: the local `isVirtualNode` copy is replaced by core's own export, and
  `t` / `tRaw` types are now core's `TranslateFn` (inference unchanged). React's
  element-aware `translationResultToString` stays local by design.

- 09029b0: `<T components>` now types the `{ tag | component, props }` config entry form.
  - **The runtime already accepted it; only the type did not.** `prepareTranslation` resolves a
    `{ tag: "a", props: { href: "/help" } }` entry into a real element, and `resolvePending`
    merges a config entry's `props` into an element or render-function handler — but the react
    `ComponentsMap` listed only the plain targets (tag name, element, render function), so the
    documented form needed a cast to compile. `ComponentHandler` now also accepts the config
    entry, narrowed to React targets on top of core's own `TagComponentConfig` so the field set
    cannot drift from the pipeline that reads it. `tag` (solid/svelte spelling) and `component`
    (vue spelling) are aliases, `props` stays optional, and entries that are neither a target nor
    a config entry are still rejected.
  - Internal: five string fast paths in `<T>`'s node conversion and `useI18n`'s text flattening
    were provably identical to the generic branch they sat in front of, and the marker-lookup
    allocation guard only chose an empty `Map` over `null`. All are gone; rendered output and the
    public API are unchanged.

- 09029b0: The catalog cache returned by `useI18n()` is `messagesCache`; `translationCache` is removed.
- 09029b0: The README and API examples seed inline catalogs with `createI18n({ messages })`, switch locale with `await setLocale()`, and load from the CDN with `import { cdnLoader } from "@comvi/plugin-fetch-loader"`, matching `@comvi/core`.
- 09029b0: `<I18nProvider>` takes a `messages` prop whose catalogs the children translate from at once and that is added to the i18n instance at commit, and `targetLocale` is now derived state keyed by the i18n instance, so a render React abandons never leaves a handover or a catalog behind.
- 09029b0: `<T>` internals now consume the shared `prepareTranslation` pipeline from the pure
  `@comvi/core/rich-text` seam instead of a package-local marker transport. Public props and
  rendering behaviour are unchanged (typed-prop API, direct-prop params, children-as-fallback,
  element/function handlers, error reporting on throwing handlers).

  Faithful-superset details:
  - Missing-translation detection now honours `params.locale` / `params.ns` when no explicit
    `locale` / `ns` prop is set; previously the lookup always used the current render locale
    and default namespace. With no reserved params it behaves exactly as before.
  - `components` entries in the shared `{ tag | component: target, props }` config form are
    now understood; such entries used to be silently ignored, rendering the tag as its inner
    text. The documented `string | ReactElement | function` handler forms are untouched.
  - Tag interpolation inside `<T>` no longer depends on ambient tag-syntax registration: the
    tag extension is passed per call.

- 09029b0: I18nProvider now accepts an instance created with `defaultParams`.
  - **It previously accepted no such instance at all.** `I18nCoreInstance` declares
    `setDefaultParams` as a property rather than a method, so `strictFunctionTypes` checks its
    parameter contravariantly and the instance is INVARIANT in its default-params type `D`. The
    boundary asked for `WrapperI18nInstance<{}>`, so `createI18n({ locale, defaultParams })` — a
    documented, first-class way to build an instance — was a compile error at
    `<I18nProvider i18n={…}>`, with no correct spelling available. Callers were left casting.
  - The boundary now takes an instance with any `D`. Only the two members that carry the invariance
    are widened: `setDefaultParams`, which is the source, and `init()`, which re-imports it by
    returning the instance recursively. Every other `D` position is a bivariant method or a
    covariant return type, so nothing else moves, and the widened type stays assignable to
    `WrapperI18nInstance<{}>` in both directions — no consumer of these types has to change.
  - Making the boundary generic over `D` would NOT have worked: every `D` position in the instance
    is a conditional type or a bivariant method, so `D` has no inference site and silently falls
    back to its constraint. A compile-checked regression test pins both the `defaultParams` instance
    and the plain one.
  - Type-only change: no runtime code was touched.

- 09029b0: `<I18nProvider targetLocale>` renders the tree in the locale a caller is switching the i18n instance to, from the render in which it changes until the i18n instance's locale next moves, so text can commit together with markup that arrives with the switch.
- 09029b0: `useI18nLoader()` now hands out `removeActiveNamespace(ns)` and `removeActiveNamespaces(ns[])`
  alongside `addActiveNamespace(s)`.

  They are core's new deactivation: the namespace leaves `getActiveNamespaces()`, its in-flight
  load is cancelled, and a `configChanged` event re-renders anything reading the active set.
  Content already in the cache is untouched — `clearMessages()` is content-only in every form
  now, so it no longer deactivates anything.

- 09029b0: **Added: the `@comvi/react` entry carries the whole toolkit.** Building an app used to take
  two packages — the instance constructor from `@comvi/core`, the bindings from `@comvi/react`.
  One entry now carries both.

  ```ts
  import { createI18n, icuCompiler, loader } from "@comvi/react";

  const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(loader(importMap));
  ```

  | export                                     | what it is                                                                                               |
  | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
  | `createI18n`                               | core's base instance constructor                                                                         |
  | `I18n` (type only)                         | core's base instance class, for typing an instance you compose — a runtime value only from `@comvi/core` |
  | `icuCompiler`                              | from `@comvi/core/icu` — the ICU compiler                                                                |
  | `loader`, `attachLoader`                   | from `@comvi/core/loader`                                                                                |
  | `plugins`, `definePlugin`                  | from `@comvi/core/plugins`                                                                               |
  | `devtools`                                 | from `@comvi/core/devtools`                                                                              |
  | every hook, `I18nProvider`, `T`, the types | the react bindings                                                                                       |

  There is no react-side wrapper object to build — the instance goes straight into
  `<I18nProvider i18n={…}>` — so the constructor IS core's own `createI18n`, re-exported by
  name. ICU is here on purpose, so neither recipe makes a react app reach for a core
  subpath.

  `attachPlugins` / `attachDevtools` are deliberately NOT among them: they are the low-level
  pair `plugins()` / `devtools()` already configure, and they stay on `@comvi/core/plugins` and
  `@comvi/core/devtools` (see `roots-drop-attach-pair.md`).

  The re-exports cost nothing: they are **named** re-exports of core's own bindings
  (`react.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
  and never through another wrapper — so the capability entries an app never calls stay out of
  its module graph. `@comvi/core/tags` is deliberately not among them: importing it registers
  tag syntax ambiently, and `<T>` uses the pure `@comvi/core/rich-text` seam instead.

  **One entry, one context.** The package publishes exactly one entry, so there is one build
  pass and one React context object: an `<I18nProvider>` and a `useI18n()` in the same app
  always see each other. Nothing else is removed and no 0.4.x import path changes.

- 09029b0: **`ComponentMap` is exported from all four binding roots.** The `<T components>` map type was module-private in react (spelled `ComponentsMap`) and vue, so neither app could type a map built outside the JSX; both now export it as `ComponentMap`, matching solid. Svelte's `ComponentMapping` (one entry of the map) is renamed to the internal `ComponentHandler`, as in solid, and is no longer a public name — `ComponentMap` is the export. (The earlier `svelte-component-mapping-target-required` note describes the same entry type under its old name.)
- 09029b0: **`useI18n(ns)` narrows keys in all four bindings.** Solid's namespace-bound `t` / `tRaw` helpers are lifted into `@comvi/core` as `NamespaceBoundTranslateFn<NS, D, R>` (and `NamespaceBoundParamsArg`), and `ns` is now generic in react, svelte and vue: `useI18n("admin").t("dashboard")` is exact for `admin:dashboard` (params typed from the generated key), a key from another namespace is rejected, and the explicit `{ ns }` form is untouched. Before, react, svelte and vue took `ns?: string`, which left no inference site — the same call was a type error even for the namespace's own keys.

  `UseI18nReturn` gains a second type parameter, `UseI18nReturn<D, NS = undefined>` (solid keeps its `<NS, D>` order), and svelte's `SvelteTextTranslationFunction` / `SvelteRawTranslationFunction` take `<D, NS>` likewise. **This can break a caller the loose overload accepted:** a call whose key resolves through the new bound overload now gets that key's own params check — `useI18n("admin").t("settings")` where `admin:settings` declares a required param is rejected instead of falling through — and a hand-written alias that spelled the old one-parameter `useI18n<D>` signature, or assigned `useI18n(ns)`'s result to a type narrower than `UseI18nReturn<D, typeof ns>`, needs the extra parameter.

- 09029b0: **`useI18nInstance()` is THE name for "give me the instance".** React, solid and svelte each export `useI18nInstance(): WrapperI18nInstance`, the bare instance the nearest provider / `setI18nContext` ancestor holds. It is the only name: solid's `useI18nContext()`, svelte's `getI18nContext()` and react's combined `useI18nContext()` are removed (svelte's own rule is `useI18n*`, not `getI18n*`, so one grep finds the API in all three). React's per-axis reads are `useI18n()`, `useLocale()` and `useIsLoading()`. Vue's equivalent is `inject(I18N_INJECTION_KEY).core`, documented in its README rather than adding a fourth spelling.
- 09029b0: **`useI18n()` returns the same member names in every binding.** `isInitialized` and `cacheRevision` — on `@comvi/solid` and `@comvi/svelte` for a release — are now on `@comvi/react` (render snapshots beside `isLoading`) and `@comvi/vue` (readonly refs, `VueI18n.isInitialized` / `VueI18n.cacheRevision`). React's four formatters (`formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime`) take the trailing `locale` override the other three already had; it defaults to the render locale. Vue's `hasTranslationNow` / `hasLocaleNow` left `useI18n()` in the same release and stayed on the `VueI18n` class.

  The durable half: `scripts/wrapper-hooks-parity.test.mjs` now diffs the four `UseI18nReturn` member NAME SETS, read from each source interface, against one allow-list of justified differences with a reason each, and checks every formatter's arity — so the next such drift fails the release instead of shipping.

- 09029b0: **`.use(installer)` is the ONE composition verb.** 0.5 shipped two verbs for two contracts — `.with(installer)`, a synchronous widening pipe on the base instance, and `.use(plugin)`, a deferred queue on the plugins capability. Two verbs one letter apart, with opposite timing, is a coin toss at every call site, and `with` needed explaining every time. `use` does not: Vue's `app.use(plugin)` calls `install(app)` synchronously and hands the app back for chaining, and Express's `app.use` and i18next's `.use(module)` are synchronous registration too. So `use` is now the only verb, and it means what every reader already thinks it means.

  ```ts
  import { createI18n, icuCompiler, definePlugin } from "@comvi/vue";
  import { cdnLoader } from "@comvi/plugin-fetch-loader";
  import { localeDetector } from "@comvi/plugin-locale-detector";

  const i18n = createI18n({ locale: "en", fallbackLocale: "en", compiler: icuCompiler })
    .use(cdnLoader({ cdnUrl }))
    .use(localeDetector({ order: ["querystring", "navigator"] }))
    .use(
      definePlugin((i18n) => {
        /* my own plugin */
      }),
    );

  createApp(App).use(i18n).mount("#app"); // vue's own `use`, unchanged
  ```

  ### The renames

  | 0.5 (before)                | 0.5 (now)                              | What it is                                             |
  | --------------------------- | -------------------------------------- | ------------------------------------------------------ |
  | `i18n.with(installer)`      | `i18n.use(installer)`                  | the composition pipe, on the BASE instance             |
  | `VueI18n.with(installer)`   | `VueI18n.use(installer)`               | the same pipe on vue's wrapper, running on `i18n.core` |
  | `i18n.use(plugin, options)` | `i18n.registerPlugin(plugin, options)` | the deferred plugin queue, on the plugins capability   |
  | —                           | `definePlugin(fn, options?)`           | NEW: registers your own inline plugin through `.use`   |
  | `E_WITH_HOST_IDENTITY`      | `E_USE_INSTANCE_IDENTITY`              | vue: the installer returned a different object         |
  | `WithHostIdentityError`     | `UseInstanceIdentityError`             | the exported type for that error                       |
  | `E_INSTALLER_NESTED_USE`    | `E_INSTALLER_AS_PLUGIN`                | an installer was registered as a plugin                |
  | —                           | `E_USE_NOT_INSTALLER`                  | NEW: `.use(f)` got something that is not an installer  |

  `registerPlugin` lines up with the neighbours it sits beside on that capability — `registerLoader`, `registerLocaleDetector`, `registerPostProcessor` — and it is no longer a composition verb, so nothing reads as if it belonged in a `.use` chain. `definePlugin(fn)` is `attachPlugins(instance).registerPlugin(fn, options)` wrapped as an installer: it attaches the plugins capability if the chain has not already and queues exactly one plugin, so an app never touches the raw queue. It is exported from `@comvi/core/plugins` and re-exported by every binding root (`@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`, `@comvi/next/client`, `@comvi/next/server`) beside `plugins`; the low-level `attachPlugins` stays on `@comvi/core/plugins` alone. `plugins()` attaches the plugins CAPABILITY; `definePlugin(fn)` registers ONE plugin on it.

  `E_USE_NOT_INSTALLER` is what makes one verb safe. The rule is IDENTITY: **an installer widens the instance in place and returns the instance it was given**, so `.use(f)` throws unless `f` handed back that same object. A shape probe ("did it return an object?") would not have been enough — `fetchLoaderPlugin(…)` and friends are async functions, so calling one returns a Promise, which is an object; the plugin would have run at composition time with its rejection unhandled. Identity catches sync and async raw plugins alike, and `.use` — core's and vue's alike — also swallows the rejection an already-invoked async plugin left behind, so the actionable error is the only thing you see. In development the message states the rule, NAMES what came back (`typeof`, and whether an object was thenable — which is what separates "you passed an async plugin" from "you passed nothing"), and names both ways out; in production it is the bare code. This is the same rule vue's wrapper has always enforced over `i18n.core`, reported there under the wrapper's own code and with the same development wording, so the branchable `code` set is now three: `E_ICU_SYNTAX`, `E_USE_INSTANCE_IDENTITY`, `E_USE_NOT_INSTALLER`.

  The rule is also stated in the TYPE: `use<T extends this>(installer: (instance: this) => T): T`, so all three misuses — a derived object, an async installer, an installer that returns nothing — are compile errors, while every widening installer still infers and widens. The runtime guard stays for JS and `any`-typed callers. Vue's `use` keeps its `T extends WrapperI18nInstance<D>` bound, which already refuses the same three shapes.

  One consequence for hand-written installers: a step that returned a DERIVED object (`.use((i18n) => ({ i18n, dispose }))`) is no longer a valid installer. Widen in place and return the instance, and keep whatever else you built beside the chain.

  Everything else keeps its name: `loader()`, `plugins()`, `devtools()`, `attachLoader`, `attachPlugins`, `attachDevtools`, `fetchLoader()`, `cdnLoader()`, `localeDetector()`, `inContextEditor()`, `icuCompiler`, the `compiler:` option, `useI18n()`, `useI18nLoader()`, `useI18nPlugins()`, `createI18nFromCore`, `createNextI18nFromInstance`, Nuxt's `i18nModule`. (`@comvi/vue`'s `createCore` alias is gone — see `vue-drop-create-core.md`; `attachPlugins` / `attachDevtools` keep their names on `@comvi/core/plugins` / `@comvi/core/devtools`, off the binding roots — see `roots-drop-attach-pair.md`.) (`createNextI18n(...).use` becomes the same installer pipe in wave 2 — see the `@comvi/next` entry.) Vue's `app.use(i18n)` and Nuxt's `nuxtApp.use` were never ours and are untouched.

  ### Migration

  ```diff
  - import { createI18n, icuCompiler, loader, plugins } from "@comvi/react";
  - import { LocaleDetector } from "@comvi/plugin-locale-detector";
  + import { createI18n, icuCompiler, loader, definePlugin } from "@comvi/react";
  + import { localeDetector } from "@comvi/plugin-locale-detector";

    export const i18n = createI18n({ locale: "en", compiler: icuCompiler })
  -   .with(loader({ uk: () => import("./uk.json") }))
  -   .with(plugins())
  -   .use(LocaleDetector({ order: ["navigator"] }))
  -   .use((i18n) => {
  -     track(i18n.locale);
  -   });
  +   .use(loader({ uk: () => import("./uk.json") }))
  +   .use(localeDetector({ order: ["navigator"] }))
  +   .use(
  +     definePlugin((i18n) => {
  +       track(i18n.locale);
  +     }),
  +   );
  ```

  Three mechanical steps, in this order:
  1. `.with(` → `.use(` everywhere, including on vue's `VueI18n`.
  2. Every remaining `i18n.use(rawPlugin)` → `i18n.registerPlugin(rawPlugin)`. A "raw plugin" is a function that returns nothing or a cleanup function: your own inline plugin, or a `*Plugin` factory's result (`localeDetectorPlugin()`, `fetchLoaderPlugin()`, `inContextEditorPlugin()`).
  3. Prefer composing instead of queuing: an inline plugin becomes `.use(definePlugin(fn))`, and a plugin package's `*Plugin` factory becomes its bare-name installer in the chain (`localeDetector()`, `fetchLoader()`, `cdnLoader()`, `inContextEditor()`).

  No `with` alias survives anywhere, and the old error identities are gone: a `catch` that branched on `E_WITH_HOST_IDENTITY` or `E_INSTALLER_NESTED_USE`, or a type import of `WithHostIdentityError`, must be updated. Step 2 has no compile error on an instance typed as `any`, and a raw plugin left in `.use()` now throws `E_USE_NOT_INSTALLER` at composition time — loudly, with the fix in the message — rather than running at the wrong moment.

- 09029b0: **Solid and svelte each gain the one per-axis primitive they were missing.** Solid shipped
  `createDefaultNamespaceSignal` with no default-params counterpart; svelte shipped
  `createDefaultParamsStore` with no default-namespace counterpart. Both sets now cover the same
  axes: solid gains `createDefaultParamsSignal(i18n)` and svelte gains
  `createDefaultNamespaceStore(i18n)` — the latter a writable store, memoized per instance like its
  siblings, where assigning into it (`store.set(ns)`) writes through to `i18n.setDefaultNamespace`.

  Both axes are also WRITABLE in both, each in its framework's own shape, so neither set is the
  read-only one. **Solid's primitives now follow one naming rule: `create*Signal` READS —
  an `Accessor` mirroring the instance, on all seven axes — and `create*State` READS AND WRITES,
  returning `[accessor, setter]`.** So `createDefaultParamsSignal(i18n)` returns
  `Accessor<DefaultParamsSnapshot<D>>`, and the tuple lives on the two `State` primitives:
  `createDefaultParamsState(i18n)` (setter → `i18n.setDefaultParams`) and
  `createDefaultNamespaceState(i18n)` (setter → `i18n.setDefaultNamespace`). Svelte keeps stores as
  its write path, so `createDefaultNamespaceStore` and `createDefaultParamsStore` are both
  `Writable`, their `set` / `update` calling the instance. Every setter writes THROUGH to the instance,
  which stays the source of truth; nothing assigns a local value. React and vue are unaffected.

  **BREAKING (breaking change on a 0.x minor): `<T raw>` is renamed to `<T markers={false}>`, in
  all four bindings, with the polarity inverted.** `raw` meant two unrelated things — `tRaw()`
  returns the structured result; `<T raw>` kept the in-context editor's invisible markers out of
  the output — and only the `<T>` prop is renamed; `tRaw` is untouched. The new name says the one
  thing it does: `markers={false}` leaves this result unmarked, and nothing else reads it. Replace
  `<T raw>` with `<T markers={false}>` wherever you render `<T>` — JSX and `.vue` (`:markers="false"`)
  / `.svelte` template markup alike.

### Patch Changes

- 09029b0: `publishConfig.access` is now declared as `public` in every published manifest.

  `access: "public"` previously lived only in `.changeset/config.json`, so it applied to
  `changeset publish` and nothing else. Any other publish path had to remember `--access public`
  or npm would refuse the scoped package as private. The declaration now travels with each
  manifest. No code changed.

- 09029b0: `useI18nLoader()` and `useI18nPlugins()` are now one line each over `@comvi/core`'s `acquireLoaderApi` / `acquirePluginsApi`, instead of four copies of the same acquisition code. `UseI18nLoaderReturn` and `UseI18nPluginsReturn` are aliases of core's `AcquiredLoaderApi` / `AcquiredPluginsApi` — the same members, the same types, the same throw on an instance without the capability, and the same per-instance identity of the returned members. Nothing in the public surface moved, so no app changes.

  The copies existed because a wrapper cannot import another wrapper, and they were pinned by a text-diff release gate after react once wrapped the `onMissingKey` callback in a `String(...)` coercion the other three did not have. With one implementation the drift is gone by construction, and so is that half of `scripts/wrapper-hooks-parity.test.mjs` — the half that diffs the four `useI18n()` member sets stays.

- 09029b0: `AnyI18nInstance` — the instance type a provider accepts, whatever `defaultParams` type it carries, with the `strictFunctionTypes` invariance write-up — is declared once in `@comvi/core` and re-exported as a type by `@comvi/react`, `@comvi/solid` and `@comvi/svelte`, instead of three identical copies. No shape change; `scripts/wrapper-hooks-parity.test.mjs` now fails on a local re-declaration.
- 09029b0: Docs: the ICU failure mode is now stated in one sentence, identical on the root README and all seven package READMEs — development throws `E_ICU_SYNTAX` the moment the catalog is loaded, before anything renders; production renders the message text literally and reports through `onError`, or `console.error` when no handler is set. The design note in `docs/design/icu.md` gains a paragraph placing that behaviour against the other runtimes: the production half is what most of them do, and the development throw at catalog load is the part unique to Comvi, because a throw at the `t()` call only finds the ICU keys someone actually rendered.
- 09029b0: Docs: the house ICU failure sentence was only true of an INLINE catalog, and every quickstart that carries it prescribes a loader. It now states both paths, in the same words on the root README, all seven package READMEs and `docs/design/icu.md`: development fails at ingestion before anything renders, inline by throwing `E_ICU_SYNTAX` at the call that carries the catalog, and over a loader by failing that namespace's load — `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and `init()` rejects with `[@comvi/core] Failed to load all namespaces …` rather than with `E_ICU_SYNTAX`, so a provider with a `fallback` keeps painting it. The production half is unchanged. What a reader saw before was a promise of an error code that never reaches their `onError` and a spinner that never clears, described as "before anything renders".

  New tests pin the loader path rather than the mechanism: `packages/core/tests/features/loader-icu-preflight.test.ts` for what `init()` rejects with, where `E_ICU_SYNTAX` is delivered, and the partial-failure case where `init()` still resolves; `packages/react/tests/loader-icu-fallback.test.tsx` for the fallback that stays painted and the error the provider reports.

  [The 0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §7 gains the same correction plus three fixes: `E_USE_INSTANCE_IDENTITY` is raised by `@comvi/next` as well as `@comvi/vue` (the `createNextI18n` result's `.use(f)`, when `f` hands back a different object), `E_LOADER_IMPORT_MAP` gets the row and the exact dev/prod text it was missing, and the section now says which names are branchable `code` properties and which — the capability-missing pair included — are message text only.

- 09029b0: Docs: the "Connect to Comvi" step now reads as three questions, in the same order and the same words on every README — which parser (`compiler: icuCompiler`, with the failure mode spelled out: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced message literally and reports it once), where the catalog comes from (`.use(cdnLoader({ cdnUrl }))`), and what to paint while it is in flight. Only the third answer differs between frameworks, and three of the seven have no gate to write at all; the code fences are unchanged.

  The root README also gains a **Reading the type errors** section: the three diagnostics a 0.4 app meets first — a typed key called without a required parameter, a member that moved off `useI18n()`, and a raw plugin factory in the `.use(…)` slot — each quoted verbatim from `tsc` or node, with the two compile errors pinned by `check=expect-error` so a drifting message is a docs-gate failure rather than a stale paragraph.

- 09029b0: The shipped `.d.ts` files now use extension-qualified relative specifiers (`./options.js`,
  `./cdn/index.js`), so the published types resolve under `moduleResolution: node16` and
  `nodenext` — the mode a Node ESM package or a `"type": "module"` app gets by default.

  Previously every relative specifier in the emitted declarations was extensionless, inherited
  verbatim from sources written for `moduleResolution: "bundler"`. Bundler resolution
  substitutes extensions; node16 does not, and it has no directory-index lookup either. The
  damage had two shapes, and only one of them was loud:
  - The `@comvi/plugin-fetch-loader` entry that carries `cdnLoader` was built as
    `export * from './cdn/index'`. A star re-export from an unresolved module contributes no
    names, so the entry point had **zero exported members**, and importing `cdnLoader` failed
    with `TS2305 ... has no exported member 'cdnLoader'`. `@comvi/core` and
    `@comvi/plugin-in-context-editor` had the same shape on `export type * from './types'` and
    `export * from './entry-production'`.
  - Every other entry used named re-exports (`export { X } from './options'`). Those keep the
    name but bind it to an unresolved module, so `X` silently became `any`. With the
    `skipLibCheck: true` nearly every app sets, a node16 consumer got **no diagnostic at
    all**: `createI18n(123)` type-checked. The packages looked typed and checked nothing.

  **On upgrade, a `node16`/`nodenext` project may see NEW type errors in its own code.** Those
  errors were always there — the types that would have reported them were `any`. Code written
  against the real signatures needs no change.

  Bundler-resolution consumers (Vite, and Next.js projects on the `bundler` default) were
  never affected — their types were correct throughout. Consumers on `node16`/`nodenext` get
  real types for the first time, with one exception outside our control: `@comvi/next`'s
  middleware and routing declarations import `next/server` and `next/link`, and `next@15.5.9`
  ships no `exports` field, so those subpaths still do not resolve under `node16` (3 ×
  TS2307 raised inside `@comvi/next`'s own declarations). Next.js projects on the `bundler`
  resolution its own tooling sets are unaffected.

  `pnpm check:types-exports` now gates attw's `node16` resolution mode in addition to
  `bundler`. attw detects this defect perfectly well — 10 × `InternalResolutionError` on
  `@comvi/plugin-fetch-loader` alone, `./cdn/index` among them. It was a single line in the
  repo's own wrapper that suppressed the entire node16 report, so the gate was green on a
  broken tree. The gate also grew a small probe for the one thing attw cannot reach: attw
  resolves entry points with a fixed condition set, so a `types` branch under a custom
  condition — `@comvi/plugin-in-context-editor`'s `"types": { "production": … }` — is never
  visited, and that is exactly where `export * from './entry-production'` was hiding.

  `@comvi/svelte` and `@comvi/nuxt` were previously excluded from that gate as "covered by
  publint". They were not: publint validates the manifest, not resolution inside a declaration
  file, and printed "All good!" on both broken trees. Every published package is now gated.

  Follow-up, deliberately NOT in this release: the declarations are corrected by a post-build
  rewrite (`tooling/qualify-dts-specifiers.mjs`) wired into each package's build. Writing the
  `.js` extension in the SOURCES instead is legal under `moduleResolution: "bundler"` and is
  emitted verbatim, which would let the rewriter be deleted and would cover `svelte-package`
  and `nuxt-module-build` without per-package wiring — one mechanical sweep over 566
  extensionless relative imports across 161 files. Neither `moduleResolution: node16` in the emitting
  tsconfig nor `rewriteRelativeImportExtensions` is a substitute.

- 09029b0: Node 18 reached end of life; the packages now declare `node >= 20`. No code changed.

  `@comvi/cli` and `@comvi/vite-plugin` are build-time tooling and keep their existing
  `node >= 22`.

- 09029b0: **Every runtime message opens with the name of the package whose code wrote it.** `[i18n]` and `[comvi]` become `[@comvi/core]` in core, `[@comvi/react]` and `[@comvi/vue]` in those bindings, and `[@comvi/next]` on next's `.use()` identity error; the in-context editor's `[ComviInContextEditor]`, `[InContextEditor]`, `[ElementHighlighter]` and `[comvi]` become `[@comvi/plugin-in-context-editor]`, and the CLI's `[comvi]` becomes `[@comvi/cli]`. A core message surfaced through a binding keeps `[@comvi/core]`. The sentence after the prefix is unchanged, except that a few messages that had no prefix gain one: core's plugin-initialization timeout and failure and its missing-tag-handler report, react's non-element tag handler error, the fetch loader's project-info, API, CDN HTTP and timeout errors, and the editor's console diagnostics. Core's `Locale is not set` and `` `messages` is not an object `` move from the `@comvi/core:` form to `[@comvi/core]`. Three catalog-level sentences now say messages, the catalog word: `No loader registered. Cannot reload messages.`, `Failed to reload messages` (core) and `Failed to refresh messages from the API.` (editor). Production error codes such as `E_ICU_SYNTAX` are unchanged.
- 09029b0: Fixes two type-level gaps in the `<T components>` config entry form shipped in the previous
  release. Type-only; no runtime code changed.
  - **A component with REQUIRED props could not be used in a config entry — the exact case `props`
    exists to serve.** The entry reused the bare-handler target type, whose call signature is
    `(params: { children: React.ReactNode }) => React.ReactElement`, so contravariance rejected any
    component declaring a prop beyond `children`:
    `{ btn: { component: Button, props: { tone: 'warn' } } }` failed to compile even though
    `resolvePending` merges those very props before rendering. A config entry's target is now
    deliberately looser than a bare handler's, matching `@comvi/solid`.
  - **A config entry must now name a target.** Core's `TagComponentConfig` makes both `tag` and
    `component` optional, so a `{ props: … }` entry with neither type-checked — while
    `isTagComponentConfig` rejects it at runtime and the pipeline forwards the raw object as an
    opaque handler. Exactly one of the two spellings is now required. This narrows what the
    previous release admitted, but only by rejecting an entry that never worked.
  - **A config entry's `props` accepts an interface-typed object again.** It took core's
    `Record<string, unknown>` verbatim, and an INTERFACE is not assignable to that type — only
    type-literal objects are — so `props: myLinkProps` failed to compile for props a caller
    legitimately holds. `props` is now `Record<string, any>`, matching `@comvi/vue` and
    `@comvi/solid`; all three wrappers now type this field identically.

- 09029b0: `<I18nProvider>` ends a `targetLocale` handover on any change of the i18n instance's locale, even one no render of the provider saw, and merges `messages` keys that name the same catalog (`en` and `en:default`) key by key, as `addMessages` does, without inheriting `Object.prototype` names as translations.
- 09029b0: `useI18n().hasTranslation()` now defaults to the locale the component is rendering in, instead of
  whatever locale the i18n instance currently carries.

  `t()`, `tRaw()` and the formatters already resolved against the render-time locale from
  `<I18nProvider>`; `hasTranslation` was bound straight to the instance and did not. Under a
  server-rendered provider that meant it answered for the instance's configured locale, so a guard like
  `hasTranslation("cta") ? t("cta") : null` could hide a string that `t()` would have rendered.

  Pass an explicit locale as the second argument to check a different one, as before.

- 09029b0: `useI18nPlugins().onMissingKey` no longer wraps the callback in a `String(result)` coercion. The member is now the bound instance method, typed as core's `I18nPluginApi["onMissingKey"]` verbatim, so a callback may return the full `TranslationResult` core accepts — a string OR the `Array<string | VirtualNode>` a rich-text fallback needs — and core decides what to do with it. The coercion was a react-only semantic the other bindings never had; it turned an array fallback into `"rich-,[object Object]"`. All four bindings reach the member the same way, through `acquirePluginsApi(instance)` from `@comvi/core/plugins`, and `scripts/wrapper-hooks-parity.test.mjs` pins that their capability hooks keep the same member sets.
- 09029b0: `MessagesMap` is now re-exported from `@comvi/core` instead of declared again, so every package names the same type.
- 09029b0: `useSetLocaleTransition()` now reports `isPending` under React StrictMode.

  StrictMode mounts a component, runs its effect cleanups, then mounts it again. The hook's
  "am I still mounted?" flag was set once when the ref was created and only ever cleared, so the
  double-mount left it stuck at `false` for the rest of the session. Every later `setLocale()` then
  skipped its pending updates: the switch still worked, but `isPending` never went true, so spinners
  and disabled language buttons never appeared. Apps that render their tree in `<StrictMode>` — the
  default in a new Next.js or Vite app in development — saw this on every locale switch.

  The flag is now re-armed on each effect run. The real unmount case is unchanged: no state update
  happens after the component goes away.

- 09029b0: A tag handler that throws inside `<T>` no longer takes the page down with it, whichever form it
  takes.

  Only one failure was contained before: a handler function that threw when `<T>` called it. Every
  other way a handler can fail escaped and tore down the surrounding tree — a component or element
  passed as `components={{ link: <MyLink /> }}` or as the `{ tag, props }` config form, and a
  handler function whose returned element threw while React rendered it. All of them now degrade
  the same way: the tag renders its own children in the handler's place, and the failure is
  reported through `i18n.reportError(error, { source: "translation", tagName })`, so your error
  handler still sees it. A working handler is untouched.

  This is a client-side guard, by React's design: error boundaries do not run during
  `renderToString`, so a handler that throws during a server render still fails that render. And once
  a tag has degraded it keeps showing its children for as long as that `<T>` stays mounted, even if a
  later render supplies a handler that would work — re-trying the handler on every render is what the
  guard exists to avoid.

- 09029b0: `<T>` translates through `tRaw` alone; the unreachable `t()` fallback is gone.
- 09029b0: `<T>` now renders a function tag handler as a React component, so a handler that uses hooks keeps working when a translation gains or loses that tag. The "must return a React element" error is gone; a handler returning `null` renders nothing, like any component; strings, numbers and arrays are accepted as React nodes.
- 09029b0: `useI18n().t()` no longer allocates an options object on every no-params call.

  The hook injects the render locale into every translation call, and it did so by building a fresh
  `{ locale, ...params }` object every time — so `t("row.label")` down a 1 000-row list allocated
  1 000 of them. A call with no params now reuses one frozen `{ locale }` object per render locale.
  Calls that pass params are unchanged, including the rule that an explicit `params.locale` wins
  over the render locale.

  This is the un-namespaced `t()`. With a namespace bound (`useI18n("forms")`), core still builds a
  `{ ns, ...params }` object per call, so that form gets one allocation instead of two rather than
  none.

  The reused object is frozen, because it is now shared across calls. A `postProcess` that writes to
  its `params` argument — an input, not a scratch object — now throws instead of silently mutating;
  core catches that per processor, skips it and reports it through `onError` with
  `source: "post-processor"`, so the render still completes.

- 09029b0: `UseI18nReturn<D>.setDefaultParams` is generic in `D` again, so a replacement bag that drops a
  constructor-guaranteed default key is a type error rather than a runtime throw.

  The internal `Instance` alias was declared as the non-generic `WrapperI18nInstance`, which collapses `D`
  to `{}` for every member reached through it. `setDefaultParams` is the only such member that
  depends on `D`, so on a `useI18n<{ brand: string }>()` return the calls
  `setDefaultParams({})`, `setDefaultParams(undefined)` and `setDefaultParams({ brand: 123 })` all
  compiled; core then threw `E_DEFAULT_PARAMS_GUARANTEED_KEY` at runtime. 0.4.1 typed this member
  through `I18n<D>`, and vue, solid and svelte all kept the generic. The alias is now
  `Instance<D extends DefaultTranslationParams = {}> = WrapperI18nInstance<D>` and the member reads
  `Instance<D>["setDefaultParams"]`, pinned by `tests/types/default-params.test-d.ts`. `reportError`,
  the other member on that alias, has a `D`-independent signature and is unchanged. Code that
  called `setDefaultParams` correctly is unaffected; code that did not now fails to compile
  instead of at run time.

- 09029b0: Docs: the CDN endpoint is named what the dashboard names it. "Distribution id" was terminology the
  product does not have — the dashboard shows a **CDN Endpoint** card holding the endpoint as a full
  URL with a **Copy URL** button, and the path segment is an opaque per-project token assembled
  server-side. So the old placeholder `https://cdn.comvi.io/your-distribution-id` was wrong in shape
  as well as in name: it asked the reader to assemble a URL out of a part they were never handed,
  when what is in their clipboard is the whole thing. Every README now shows the complete endpoint
  and says to paste what the card gives them; the `@example` doc comments on `fetchLoaderPlugin` and
  `cdnLoaderPlugin` match. The navigation was already correct and is unchanged. 23 occurrences across
  12 files, comments only in the two `.ts` files.

  The root README's quick start is also runnable for the first time, which is a repository-surface
  change rather than a package one: step 1 gained the `npm create vite` scaffold it never had (its
  fence imports `react-dom/client`, and `@comvi/react` peer-depends on `react` only, so following the
  README alone ended in `ERR_MODULE_NOT_FOUND`), gained the `src/App.tsx` that actually calls `t()`
  instead of describing it in prose, and closes with the dev command and the literal strings to
  expect. Step 2 now rewrites `src/main.tsx` as one copy-pasteable fence, matching the docs site
  instead of inventing a second project shape around a new `src/i18n.ts`.

- 09029b0: Every package README is now the short form: what the package is, install, the inline catalog,
  connecting to Comvi, and the handful of things specific to that framework. The API references, the
  SSR walkthroughs, the typed-keys sections and the composing-by-hand references moved to
  comvi.io/docs/i18n, which is now the canonical place for all of it — each removed section has a
  page there, linked from the README that used to carry it. No code changed.

  The READMEs are published files, so this is what a reader sees on npm. They were 204 to 595 lines
  each and most of that was reference material that drifts: a package README cannot be re-verified
  against the build the way a docs page can, and eight of ten competitor READMEs carry no API
  reference at all. What stays is deliberately the part a reader runs in the first minute, plus the
  facts that only exist in this repo — one measured size figure per package, named by the fixture in
  `scripts/size-budgets.json` so the `prose/stale-size-figure` gate still grades it, and the house
  paragraphs (the ICU failure mode, the instance definition, the `@comvi/core` formatters caveat, the
  Content Deploy sentence), kept byte-identical.

- 09029b0: `useI18nHost` is now `useI18nInstance`, and the re-exported `AnyI18nHost` type is now `AnyI18nInstance`.
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
- Updated dependencies [09029b0]
  - @comvi/core@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [67780e8]
  - @comvi/core@0.4.1

## 0.4.0

### Minor Changes

- aaea018: Instance-level `defaultParams`:
  - `createI18n({ defaultParams: { formality: "formal" } })` merges the given params under every `t()`/`tRaw()` call; call-level params override defaults key by key (shallow merge).
  - `defaultParams` contains non-nullish interpolation values only. Per-call controls (`locale`, `ns`, `fallback`, `raw`) and `null`/`undefined` values are rejected in types and at runtime.
  - `setDefaultParams(...)` replaces the defaults at runtime and emits `configChanged` (source: `"defaultParams"`), so framework bindings re-render automatically. Defaults guaranteed by the constructor cannot later be removed or changed outside the generated message schema; instances created without defaults may still set or clear dynamic defaults. Explicitly optional default properties are rejected because they cannot represent constructor guarantees.
  - Params objects are copied shallowly on write and read: top-level additions/reassignments do not mutate instance state, while nested arrays, VNodes, callbacks, and props retain identity and should be treated as immutable.
  - Typed core/Vue instances make constructor-guaranteed, type-compatible message params optional at call sites. Framework hooks remain conservative by default and accept an explicit defaults type when the provider scope guarantees it.
  - An ICU `select` whose param is missing still falls back to its `other` branch, which keeps missing-default setups rendering the informal/default text instead of breaking.

  All framework facades expose the same `defaultParams` / `setDefaultParams` names with idiomatic reactivity: Vue/Nuxt `ComputedRef`, React render snapshot, Solid accessor, and Svelte readable store. Typed translation calls carry the explicit defaults type in every binding, including Svelte stores. `createNextI18n()` and Nuxt client/request instances now forward constructor defaults.

### Patch Changes

- bec9ad6: Bundle-size pass for @comvi/core (−17% min, −7% gzip for consumers; more when formatters are unused).

  **BREAKING (@comvi/core):** `formatNumber` / `formatDate` / `formatCurrency` / `formatRelativeTime` and the `dir` getter moved off the `I18n` class to standalone tree-shakeable exports. Migrate `i18n.formatNumber(v, opts)` → `formatNumber(i18n, v, opts)` and `i18n.dir` → `getTextDirection(i18n.locale)`. Framework bindings (`useI18n`, `useFormatters`) keep their existing API — no changes needed in components.

  Other changes:
  - Internal class members now use native `#private`, so app bundlers mangle them (CDN UMD 25.5 → 21.2 kB).
  - `TranslationCache.getInternalMap()` returns the snapshot typed as `ReadonlyMap` without a runtime wrapper.
  - New `development` export condition ships readable error messages in dev; the production artifact keeps compact `E_*` codes.

- Updated dependencies [bec9ad6]
- Updated dependencies [a5c80b8]
- Updated dependencies [6463199]
- Updated dependencies [38ce169]
- Updated dependencies [aaea018]
  - @comvi/core@0.4.0

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- 88ae52a: **Minor release — React 18+ baseline, internal architecture refactor, additive selector hooks.**

  ### Added
  - `useLocale()` hook — narrow locale-only subscription for components that don't need the full i18n bag (e.g. `<Link>`, routing utilities). Skips re-renders on namespace loads and loading-state changes.
  - `useIsLoading()` hook — selector hook returning `{ isLoading, isInitializing }`. Skips re-renders on locale/translation changes.
  - `useSetLocaleTransition()` hook — wraps `i18n.setLocaleAsync()` in `React.useTransition` so the previous UI stays interactive while the new locale loads. Returns `{ isPending, setLocale }`.
  - `useFormatters()` hook — returns memoized `{ formatNumber, formatDate, formatCurrency, formatRelativeTime }` bound to `useLocale()` so formatter output auto-updates on locale change.

  ### Changed
  - **Internal architecture:** provider now uses a 2-context split — `LocaleContext` (string axis) plus `I18nInstanceContext` (i18n + loading state). `cacheRevision` is no longer broadcast to all subscribers; `<T>` reads it directly via `useSyncExternalStore`. Public `useI18n()` API surface is unchanged.
  - `t()` and `tRaw()` returned by `useI18n()` now rebuild on locale change (memo deps include `locale`). The React-tracked locale is injected into every bound translation call, closing a tearing surface where the bound function previously read the mutable `i18n.locale` at call time during `startTransition`-wrapped locale flips. Code that depended on stable `t` identity across locale flips needs to adapt; the new behavior is the intended fix.

  ### Deprecated
  - `useI18nContext()` — works through 0.3 but is scheduled for removal in a future major. Use `useI18n()` instead (same return shape, finer-grained subscriptions).

  ### Removed
  - **React 16.8–17 peer support.** Requires `"react": "^18.0.0 || ^19.0.0"`. Users on React 17 should stay on `@comvi/react@^0.2.x`.
  - `use-sync-external-store` shim dependency — replaced with the native `useSyncExternalStore` from React 18+.

  ### Fixed
  - Non-translation consumers (`<Link>`, `usePathname()`, etc.) no longer re-render on every namespace load — measurement-confirmed via the new commit-counter harness.
  - `useI18n()` formatter methods (`formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime`) now use the React-tracked render locale, matching `useFormatters()` and avoiding mutable-instance locale reads during concurrent locale changes.
  - `useSubscribe()` event-list fragility — refactored to rest-args with a stable join-key dependency so dynamic event arrays no longer get a stale subscription.
  - `<T>` type safety — replaced `as any` overload-bridge casts with `as never`; `BIND_METHODS` bag now uses a mapped type instead of `Record<string, unknown>`.
  - `<T>` per-render allocation — no longer allocates `new Map()` + `{}` for tag handlers when the `components` prop is undefined (the common case).
  - `<T>` `React.cloneElement` usage migrated to function composition / `React.createElement` (closes a React 19 soft-deprecation).

  ### Internal
  - Peer dependency on `@comvi/core` bumped to the new minor.
  - Unit tests + Profiler-based commit-counter harness + tearing repros (happy-dom) + Playwright e2e (in `test-apps/next`) verify the changes.

  See CHANGELOG for the per-package upgrade checklist.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

- 8e01e2b: Fixed: React's "Cannot update a component (`X`) while rendering a different component (`Y`)" warning no longer fires when a parent component synchronously emits an i18n event during render (e.g. `<I18nProvider messages={...}>` re-rendering on locale change triggers `addTranslations` from its `useState` initializer).

  Internal: `useSubscribe` and `useStoreRevision` now defer React's store-update notification by one microtask (`queueMicrotask`), breaking the synchronous `_emit → subscribe-callback → scheduleUpdateOnFiber` chain that produced the warning (see `packages/core/src/core/i18n.ts:438-448`). A `disposed` flag prevents stale callbacks after unsubscribe or `i18n` prop swap. The revision counter in `useStoreRevision` is still bumped synchronously so `getSnapshot` reads always see the latest value.

  **Significantly narrows** the v0.3.1 KNOWN LIMITATION previously documented in `useI18n.ts:45-53` (residual race window depends on React-internal subscribe-set-up vs first-event ordering).

  Pre-1.0 internal change; consumer API unchanged.

- 872680e: Close the React `useStoreRevision` re-render race for non-cache events (M3).

  A `configChanged` (fallback-locale / namespace-activation) or `defaultNamespaceChanged` that fired in the narrow window between a `useI18n` consumer's commit and its `useSyncExternalStore` subscribe-effect attaching could be dropped — the snapshot's per-component event counter started at 0 and only counted post-subscribe events, and these events don't bump the translation-cache revision.

  The fix makes the React store snapshot **content-addressed**: it derives purely from observable instance state (`translationCache.getRevision()` + `isInitialized` + default namespace + active namespaces + fallback locales) instead of a subscription-timing-dependent counter, so state mutated before the subscriber attached is detected on the post-subscribe re-read. As a bonus, a bare `configChanged`/`defaultNamespaceChanged` emit that does NOT change state no longer forces a spurious re-render.

  `@comvi/core` adds a small read-only `getFallbackLocales()` accessor used by the snapshot.

- c705faf: Polish from the v0.3 review (no behavior change to existing valid usage):
  - **cli:** warn (and ignore) when a `.comvirc.json` carries the deprecated `languages` field — it was renamed to `locales`. Mirrors the existing `defaultNsName` deprecation warning.
  - **svelte:** tighten `TProps.params` from `Record<string, unknown>` to `TranslationParams`, matching `@comvi/solid` and what `tRaw` actually accepts.
  - **react:** document the `useSetLocaleTransition()` and `useFormatters()` hooks in the README.

- Updated dependencies [1feaed4]
- Updated dependencies [e1f4ccb]
- Updated dependencies [6e5370c]
- Updated dependencies [88ae52a]
- Updated dependencies [4050429]
- Updated dependencies [872680e]
  - @comvi/core@0.3.0

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
