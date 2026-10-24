# @comvi/svelte

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
- 09029b0: **BREAKING (breaking change on a 0.x minor):** `@comvi/svelte` runs on a base `@comvi/core`
  instance, and the four loader/plugin members left `useI18n()` for two dedicated context readers.

  This is the binding where the old contract did not merely mistype the instance — it **crashed**
  on one. `useI18n()` eagerly `.bind()`-ed all four in the object literal it returned, so on an
  instance without those capabilities it threw
  `Cannot read properties of undefined (reading 'bind')` before a single translation rendered.

  | 0.4.x                                                                   | 0.5.0                                                              |
  | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
  | `const { addActiveNamespace, reloadMessages, onLoadError } = useI18n()` | the same names, plus `addActiveNamespaces`, from `useI18nLoader()` |
  | `const { onMissingKey } = useI18n()`                                    | `const { onMissingKey } = useI18nPlugins()`                        |
  | `const { t, reloadMessages } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; `useI18nLoader()` takes no argument     |

  **They are readers, NOT stores.** `useI18nLoader()` / `useI18nPlugins()` call
  `useI18nInstance()`, so — like `useI18n()` — they are callable during component
  initialisation only, and what they return is a plain object of bound functions. Do not
  `$`-prefix a member. The asymmetry with `createLocaleStore()` & friends is deliberate: a
  capability action is an imperative operation, not a value that changes over time. An instance
  that lacks the capability fails at the acquisition call with a message naming the fix, in
  development **and** in production.

  **Fixed: the published package was unimportable from webpack and Node ESM.** `dist/*.js`
  re-exported its siblings with extensionless specifiers, which strict-ESM resolvers reject
  for a `"type": "module"` package. The source now carries the emitted `.js` extension; no
  public API changed.

  `setI18nContext(i18n)`, `useI18nInstance()` and all seven store factories accept
  `WrapperI18nInstance` instead of the concrete `I18n` class — the five read-only stores plus the
  writable `createDefaultNamespaceStore` and `createDefaultParamsStore`, whose `set` / `update`
  write through to the instance — and the store factories gained an
  optional `D` type parameter (inferred) because `WrapperI18nInstance<D>` is invariant in `D`. See
  the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md).

- 09029b0: **BREAKING (breaking change on a 0.x minor): `createI18n` from `@comvi/svelte` now builds the base instance.** `@comvi/svelte` has re-exported core's `createI18n` and `I18n` by name since 0.4, and in 0.4 that constructor arrived with ICU, tag syntax, async loading, the plugins capability and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

  **Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/svelte/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported, and it never published, so there is no deprecation debt.

  Nothing about `setI18nContext()`, `useI18n()`, `<T>`, the store factories or the capability
  readers changes here; this is the instance underneath them, and the packaging half is in
  `svelte-single-package-slim.md`. Compose what you had back — every installer is re-exported
  from `@comvi/svelte`, so each fix stays inside the one specifier you already have:

  | you had                                      | you add                                            |
  | -------------------------------------------- | -------------------------------------------------- |
  | ICU plurals, select, selectordinal           | `compiler: icuCompiler` in the constructor options |
  | loader (`registerLoader`, …)                 | `.use(loader(map))`, or `.use(attachLoader)`       |
  | `.use(plugin)`, `onMissingKey`               | `.use(definePlugin(p))`, or `registerPlugin(p)`    |
  | discovery (`instanceId`, `window.__COMVI__`) | `.use(devtools({ instanceId }))`                   |
  | `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`       |

  ```svelte
  <script lang="ts">
    import { createI18n, icuCompiler, loader, setI18nContext } from "@comvi/svelte";

    // INLINE — the constructor ingests the catalog.
    setI18nContext(createI18n({ locale: "en", compiler: icuCompiler, messages }));
    // REMOTE — the same option, in the same place.
    setI18nContext(createI18n({ locale: "en", compiler: icuCompiler }).use(loader(importMap)));
  </script>
  ```

  `compiler` is a constructor field held for the instance's life, so one option covers every
  catalog source, and nothing about composition is ordered.

  **`<T>` moved to a pure seam.** It used to import `@comvi/core/tags`, whose import registers
  tag syntax **ambiently**, so rendering rich text anywhere silently switched plain `t()` over
  to parsing `<tag>` markup too. It now imports the pure `@comvi/core/rich-text` seam, which
  hands the grammar to core per call. `<T>` renders exactly as before; what changed is that it
  no longer decides `t()`'s behaviour behind your back — that is now your own
  `import "@comvi/core/tags"`. `svelte-package` preserves modules, so an app that never
  renders `<T>` drops the whole rich-text path. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §3 and
  `core-single-entry-convergence.md`.

- 09029b0: **BREAKING (breaking change on a 0.x minor):** `<T>` now renders structurally: the translation's
  parsed VirtualNode tree becomes real DOM nodes via recursive Svelte 5 snippets
  (`<svelte:element>`), consuming the shared `prepareTranslation` pipeline from the pure
  `@comvi/core/rich-text` seam. The entire HTML-string layer is gone — no `{@html}` sink, no
  `escapeHtml` / `escapeAttr`, no attribute filtering, no tag allowlist. Untrusted
  translations can only ever produce text and the tags you map; unmapped tags fall back to
  their inner text.
  - **`components` now accepts Svelte components** (and `{ tag: Component, props }` configs),
    in parity with the vue / react / solid wrappers. A component handler receives the tag's
    rendered content as its `children` snippet plus any `props` from the mapping. String and
    `{ tag: "a", props }` mappings work as before.
  - **`allowedTags` is removed.** There is no HTML-string rendering to allowlist; element
    mappings come only from your `components` map.
  - **No implicit attribute rewriting.** The old renderer injected `rel="noopener noreferrer"`
    on `<a target="_blank">`, forced `alt=""` on `<img>`, and stripped `on*` / `srcdoc` /
    `formaction` from mapping props. Mapping props are developer-owned and now pass through
    untouched (boolean `false` still omits the attribute). Set `rel` / `alt` explicitly where
    you relied on the injection.
  - Reserved-prop forwarding (`ns` / `locale` / `fallback` / `markers`) follows the shared rule: a
    prop overrides the same-named `params` key only when it is not `undefined`. Concrete-value
    behaviour is unchanged.
  - **The pipeline comes from a PURE seam**, so rendering `<T>` no longer switches plain
    string-API `t()` over to parsing `<tag>` markup. That is now the app's own
    `import "@comvi/core/tags"`.

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

- 09029b0: **`ComponentMap` is exported from all four binding roots.** The `<T components>` map type was module-private in react (spelled `ComponentsMap`) and vue, so neither app could type a map built outside the JSX; both now export it as `ComponentMap`, matching solid. Svelte's `ComponentMapping` (one entry of the map) is renamed to the internal `ComponentHandler`, as in solid, and is no longer a public name — `ComponentMap` is the export. (The earlier `svelte-component-mapping-target-required` note describes the same entry type under its old name.)
- 09029b0: **`useI18n(ns)` narrows keys in all four bindings.** Solid's namespace-bound `t` / `tRaw` helpers are lifted into `@comvi/core` as `NamespaceBoundTranslateFn<NS, D, R>` (and `NamespaceBoundParamsArg`), and `ns` is now generic in react, svelte and vue: `useI18n("admin").t("dashboard")` is exact for `admin:dashboard` (params typed from the generated key), a key from another namespace is rejected, and the explicit `{ ns }` form is untouched. Before, react, svelte and vue took `ns?: string`, which left no inference site — the same call was a type error even for the namespace's own keys.

  `UseI18nReturn` gains a second type parameter, `UseI18nReturn<D, NS = undefined>` (solid keeps its `<NS, D>` order), and svelte's `SvelteTextTranslationFunction` / `SvelteRawTranslationFunction` take `<D, NS>` likewise. **This can break a caller the loose overload accepted:** a call whose key resolves through the new bound overload now gets that key's own params check — `useI18n("admin").t("settings")` where `admin:settings` declares a required param is rejected instead of falling through — and a hand-written alias that spelled the old one-parameter `useI18n<D>` signature, or assigned `useI18n(ns)`'s result to a type narrower than `UseI18nReturn<D, typeof ns>`, needs the extra parameter.

- 09029b0: **`useI18nInstance()` is THE name for "give me the instance".** React, solid and svelte each export `useI18nInstance(): WrapperI18nInstance`, the bare instance the nearest provider / `setI18nContext` ancestor holds. It is the only name: solid's `useI18nContext()`, svelte's `getI18nContext()` and react's combined `useI18nContext()` are removed (svelte's own rule is `useI18n*`, not `getI18n*`, so one grep finds the API in all three). React's per-axis reads are `useI18n()`, `useLocale()` and `useIsLoading()`. Vue's equivalent is `inject(I18N_INJECTION_KEY).core`, documented in its README rather than adding a fourth spelling.
- 09029b0: `setI18nContext(i18n, { onError })` reports a failed auto-init.

  The auto-init runs in a microtask that nothing in the component can await, so an `init()`
  rejection — an unreachable CDN, a wrong endpoint — used to be swallowed by the binding.
  `onError` is the per-app hook react's and solid's providers already expose as a provider prop:

  ```svelte
  setI18nContext(i18n, { onError: (error) => reportToSentry(error) });
  ```

  The instance's own `createI18n({ onError })` handler still reports the failure first, with
  `{ source: "init" }`. Without an `onError` the rejection stays swallowed, exactly as before.

- 09029b0: **Removed** the deprecated `createLanguageStore` (deprecated since ≤0.4.0) — use
  `createLocaleStore`.
  - The cache-revision store (`createCacheRevisionStore`, and the `cacheRevision` returned by
    `useI18n()`) now bumps on core's canonical 7-event revision set via `subscribeToRevision`,
    adding `localeChanged` and `loadingStateChanged` to the previous 5-event list, so its
    `configChanged` semantics and event coverage match the vue bridge. Derived translation
    stores may recompute (cheaply) on locale/loading changes they previously ignored; output
    values are unchanged.
  - `dist/types.js`, an empty artifact emitted for a pure-type module, is no longer published.
  - Internal dedupe: `translationResultToString` now comes from `@comvi/core`, and
    `SvelteTextTranslationFunction` / `SvelteRawTranslationFunction` are aliases of core's
    `TranslateFn` (inference unchanged).

- 09029b0: The catalog cache accessor returned by `useI18n()` is `getMessagesCache()`; `getTranslationCache()` is removed.
- 09029b0: The README and API examples seed inline catalogs with `createI18n({ messages })`, switch locale with `await setLocale()`, and load from the CDN with `import { cdnLoader } from "@comvi/plugin-fetch-loader"`, matching `@comvi/core`.
- 09029b0: setI18nContext now accepts an instance created with `defaultParams`.
  - **It previously accepted no such instance at all.** `I18nCoreInstance` declares
    `setDefaultParams` as a property rather than a method, so `strictFunctionTypes` checks its
    parameter contravariantly and the instance is INVARIANT in its default-params type `D`. The
    boundary asked for `WrapperI18nInstance<{}>`, so `createI18n({ locale, defaultParams })` — a
    documented, first-class way to build an instance — was a compile error at
    `setI18nContext(i18n)`, with no correct spelling available. Callers were left casting.
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

- 09029b0: `useI18nLoader()` now hands out `removeActiveNamespace(ns)` and `removeActiveNamespaces(ns[])`
  alongside `addActiveNamespace(s)`.

  They are core's new deactivation: the namespace leaves `getActiveNamespaces()`, its in-flight
  load is cancelled, and a `configChanged` event re-renders anything reading the active set.
  Content already in the cache is untouched — `clearMessages()` is content-only in every form
  now, so it no longer deactivates anything.

- 09029b0: **Added: the `@comvi/svelte` entry carries the whole toolkit.** Building an app used to take
  two packages — the instance constructor from `@comvi/core`, the bindings from `@comvi/svelte`.
  One entry now carries both.

  ```svelte
  <script lang="ts">
    import { createI18n, icuCompiler, loader, setI18nContext } from "@comvi/svelte";

    setI18nContext(
      createI18n({ locale: "en", compiler: icuCompiler }).use(loader(importMap)),
    );
  </script>
  ```

  | export                                       | what it is                                                                                               |
  | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
  | `createI18n`                                 | core's base instance constructor                                                                         |
  | `I18n` (type only)                           | core's base instance class, for typing an instance you compose — a runtime value only from `@comvi/core` |
  | `icuCompiler`                                | from `@comvi/core/icu` — the ICU compiler                                                                |
  | `loader`, `attachLoader`                     | from `@comvi/core/loader`                                                                                |
  | `plugins`, `definePlugin`                    | from `@comvi/core/plugins`                                                                               |
  | `devtools`                                   | from `@comvi/core/devtools`                                                                              |
  | every store factory, the readers, `T`, types | the svelte bindings                                                                                      |

  There is no svelte-side wrapper object to build — the instance goes straight into
  `setI18nContext(i18n)` — so the constructor IS core's own `createI18n`, re-exported by name.
  ICU is here on purpose, so neither recipe makes a svelte app reach for a core subpath.

  `attachPlugins` / `attachDevtools` are deliberately NOT among them: they are the low-level
  pair `plugins()` / `devtools()` already configure, and they stay on `@comvi/core/plugins` and
  `@comvi/core/devtools` (see `roots-drop-attach-pair.md`).

  The re-exports cost nothing: they are **named** re-exports of core's own bindings
  (`svelte.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
  and never through another wrapper. `@comvi/core/tags` is deliberately not among them:
  importing it registers tag syntax ambiently, and `<T>` uses the pure `@comvi/core/rich-text`
  seam instead.

  **One entry, one context key.** `svelte-package` preserves modules, so this package never
  had the "a provider from one entry is invisible to a hook from the other" hazard the bundled
  wrappers did — every published path resolved to the same binding modules. What one entry
  buys is the end of two published surfaces that had to be kept in step, and the entry
  re-exports those binding modules themselves rather than wrapping them, so the `getContext`
  key stays a single object. Nothing else is removed and no 0.4.x import path changes.

- 09029b0: `<T>` now takes interpolation params as direct props, the way `@comvi/react`'s `<T>` always has.

  ```svelte
  <T i18nKey="cart.items" count={2} name="Ada" />
  ```

  Anything that is not one of `<T>`'s own props (`i18nKey`, `params`, `ns`, `locale`, `fallback`,
  `markers`, `components`, `children`) is passed to the translation as a param, so a one-value message
  no longer needs a `params={{ … }}` object. `params` still works and can be combined with direct
  props; on a name collision the direct prop wins, matching react. A direct prop whose value
  changes re-renders the translation.

- 09029b0: A tag handler that throws inside `<T>` no longer takes the page down with it, and the peer range
  narrows to `svelte: ^5.3.0`.

  **Peer change.** `<T>` now wraps each tag handler in `<svelte:boundary>`, which Svelte added in
  5.3. If you are on Svelte 5.0–5.2, upgrade to 5.3 or later; every 5.x release since then already
  satisfies the new range.

  **What changed.** A component passed through `components={{ strong: MyBadge }}` used to be rendered
  unguarded: if it threw — a bad prop access, a failing child import — the error escaped `<T>` and
  Svelte tore down the surrounding tree. It now degrades to the translation's own children — the same
  degradation the React binding gives its tag handlers — and reports through
  `i18n.reportError(error, { source: "translation", tagName })` so the failure is still visible to
  your error handler. A working handler is untouched.

  This is a client-side guard: `<svelte:boundary>` does not run during SSR, so a handler that throws
  during a server render still fails that render.

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

- 09029b0: Fixed `setI18nContext`'s auto-init `onError` being able to receive a non-Error value (a thrown string, object, etc.) despite being typed to receive an `Error`. A non-Error rejection is now normalized into an `Error`, with the original value kept on `cause`, matching react/solid/vue.
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
- 09029b0: A `<T components>` config entry must now name a target, and its `props` accept an interface-typed
  object like the other three bindings.

  `ComponentMapping`'s object form left both `tag` and `component` optional, so
  `{ link: { props: { href: "/" } } }` type-checked. It is not a config entry to the runtime:
  `isTagComponentConfig` tests for `"tag" in value || "component" in value`, so the object was
  forwarded as an opaque framework handler with its `props` dropped. On the client
  `<svelte:boundary>` caught the resulting `TypeError`, reported it through
  `i18n.reportError(error, { source: "translation", tagName })` and degraded the tag to bare
  children. On the server there is no boundary, so reading `render(...).body` threw and the whole
  render was lost. The object form is now a union requiring one of `tag`/`component`, matching
  `@comvi/react`, `@comvi/solid` and `@comvi/vue`; 0.4.1 required `tag` outright.

  `props` also widens from `Record<string, unknown>` to `Record<string, any>`, the value type the
  other three already use: an INTERFACE-typed props object is not assignable to
  `Record<string, unknown>` (only type-literal objects are), so a legitimate props value was being
  rejected here alone.

  Both are covered by a new `tests/types/components-map.test-d.ts`, and the server path now has a
  vitest project of its own (`tests/ssr/`) that renders `<T>` through `svelte/server`.

- 09029b0: `isInitializing` reads `true` while the auto-init `setI18nContext` scheduled has not started yet, so the documented `{#if $isInitializing}` gate is closed from the first render and raw keys are never rendered.
- 09029b0: The locale store now reads the instance on `localeChanged`, so a listener that switches the locale again no longer leaves it on a stale locale.
- 09029b0: `formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` from `useI18n()` now follow the locale like `$t`, so markup and `$derived` that call them re-run on a locale switch, and a trailing `locale` argument still overrides it.
- 09029b0: `<T locale="de">` no longer re-renders when the app's global locale changes.

  Svelte's cache-revision store bumped on core's whole revision event set, the locale and
  loading-state axes included. Both already have their own stores, so `<T>` was subscribed to the
  locale twice — and a component that had pinned a locale recomputed its translation on every global
  locale switch and on every `isLoading` flip, even though its answer could not have changed. On a
  page with many pinned `<T>` elements, a single locale switch re-ran all of them for nothing.

  The revision store now ignores `localeChanged` and `loadingStateChanged`, matching the Solid
  binding, and `<T>` reads the locale store only when no `locale` prop is given. An unpinned `<T>`
  follows the global locale exactly as before, and a catalog change still reaches a pinned one.

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

- 88b4941: Drop Svelte 4; migrate to Svelte 5 runes only.

  **BREAKING:** `@comvi/svelte` now requires Svelte 5 (`peerDependencies.svelte` is `^5.0.0`). Svelte 4 is no longer supported — stay on the previous minor if you need it.
  - `<T>` (`T.svelte`) is rewritten with runes (`$props()`, `$derived`/`$derived.by`, `{@render children()}`) so it compiles cleanly under both runes-default and global `runes: true` consumers, with no deprecation warnings. The previous legacy syntax (`export let`, `$:`, `$$props`, `$$slots`, `<slot>`) broke under `compilerOptions.runes: true`.
  - Explicit-prop forwarding semantics for `ns`/`locale`/`fallback`/`raw` are preserved via an internal sentinel (replacing the removed `$$props`), guarded by a characterization test.
  - `<T>` now injects safe defaults for `{@html}` output: `rel="noopener noreferrer"` on `<a target="_blank">` and an empty `alt=""` on `<img>` without one.
  - New exported type `TProps` for the `<T>` component props.
  - Docs/examples use Svelte 5 idiom (`onclick`/`onchange`, `$state`, `{@render}`); added an SSR (SvelteKit) section documenting the per-request instance pattern and `await i18n.init()`.
  - Build no longer runs a redundant `tsc --emitDeclarationOnly` pass (`svelte-package` emits complete declarations). `svelte-preprocess` is retained so published `.svelte` files stay TS-stripped. No change to published output. Added `publint` + `@arethetypeswrong/cli` checks; `attw` runs as an ESM-only contract check (ignoring `cjs-resolves-to-esm` and the svelte-package `internal-resolution-error`, both structural and bundler-irrelevant).
  - Stores (`useI18n`, `createLocaleStore`, etc.) are unchanged — `svelte/store` remains fully supported in Svelte 5.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

- 82dbcf1: Align package metadata.
  - Add `engines.node: ">=22"` to match the workspace root constraint.
  - Fix `repository.url` to include the required `git+` prefix.

- 4050429: CORE reactivity fixes from the v0.3 review:
  - **core (L3):** `addTranslations()` no longer emits `configChanged` for runtime-added translations — it relies on the `namespaceLoaded` event (and the cache-revision bump) that `_nsAddTranslations` already fires, removing a redundant double re-render. **Behavior note:** if you have an external `on("configChanged", …)` listener that was reacting to `addTranslations`, switch it to `on("namespaceLoaded", …)`. `configChanged` is still emitted for fallback-locale and namespace-activation changes. An empty `addTranslations({})` is now a true no-op.
  - **core (L1):** the `Intl` formatter caches (number/date/relative-time) are now bounded (FIFO eviction at 1000 entries), mirroring the template cache. Prevents unbounded growth for apps formatting many distinct `(locale, options)` combinations via the per-call `locale` override.
  - **solid & svelte (M4):** the cache-revision signal/store now uses a single monotonic counter instead of summing two independent counters, which could collide non-monotonically and drop a re-render (e.g. a `configChanged` that didn't change the translation cache).
  - **vue (M1):** added imperative, non-reactive `hasTranslationNow(key, opts?)` and `hasLocaleNow(locale, namespace?)` returning plain booleans — for use in loops/handlers where the reactive `hasTranslation()`/`hasLocale()` (which allocate a `computed()` per call) would leak outside an effect scope. Re-exposed through `@comvi/nuxt`'s `useI18n()`.

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

- 46cdfb4: Strip TypeScript types from published `.svelte` files via `svelte-preprocess`. Previously `dist/T.svelte` shipped with raw `<script lang="ts">` (type annotations and `import type`), which broke consumers and bundle analyzers without a TS-aware Svelte preprocessor (e.g. bundlephobia, older webpack setups).
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
