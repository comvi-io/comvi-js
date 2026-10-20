# @comvi/vue

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
- 09029b0: **BREAKING (breaking change on a 0.x minor): `@comvi/vue` no longer re-exports `createCore`.** After the `.use(installer)` pipe, `createI18nFromCore` is the only reason the alias existed, and both are the escape hatch for an instance built elsewhere — which is built with `createI18n` from `@comvi/core` directly: the instance is elsewhere by definition, so crossing the import boundary is more honest than a local alias. `import { createCore } from "@comvi/vue"` becomes `import { createI18n as createCore } from "@comvi/core"`; `createI18nFromCore` is unchanged.
- 09029b0: **BREAKING (breaking change on a 0.x minor) — `@comvi/vue` runs on a base `@comvi/core` instance.**
  `VueI18n` is now `VueI18n<D, C extends WrapperI18nInstance<D> = I18n<D>>` around an injected
  instance it exposes as `readonly core: C`, and the capability APIs live where the instance actually
  has them.

  **New:** `useI18nLoader()` / `useI18nPlugins()` composables (`UseI18nLoaderReturn`,
  `UseI18nPluginsReturn`); and, as the escape hatch for an instance built elsewhere,
  `createI18nFromCore(core, options?)`, which wraps an instance built with `createI18n` from
  `@comvi/core` directly (`import { createI18n as createCore } from "@comvi/core"`) and preserves
  its exact type as `i18n.core`. This package does not re-export core's constructor under a second
  name — see `vue-drop-create-core.md`. `createI18n(options)` is unchanged and
  still the default: it builds the instance internally from the same options object, and
  `.use(installer)` on its result composes capabilities onto that instance.

  | 0.4.x                                                                   | 0.5.0                                                                            |
  | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
  | `const { reloadMessages, addActiveNamespace, onLoadError } = useI18n()` | the same names from `useI18nLoader()`                                            |
  | `const { onMissingKey } = useI18n()`                                    | `const { onMissingKey } = useI18nPlugins()`                                      |
  | `const { t, reloadMessages } = useI18n("ns")`                           | `useI18n("ns")` keeps `t`; the capability composables take no argument           |
  | `i18n.registerLoader(…)` and the other six instance proxies             | `i18n.core.registerLoader(…)` etc.                                               |
  | `i18n.use(plugin)` / `createI18n(options).use(plugin)`                  | `i18n.core.registerPlugin(plugin)` — assign first, then register on the instance |
  | `new VueI18n(options)`                                                  | `createI18n(options)` — the constructor now takes `(core, vueOptions)`           |

  Plugin registration is the **eighth** dropped proxy and the one that changed late: 0.4's
  `use(plugin)` briefly survived behind a capability guard, which made it the only member typed
  present on every `C` that could still throw "missing capability" at runtime — precisely the
  failure class this release removes. It is gone from the class in types and at runtime, and it is
  called `registerPlugin` on the instance. The `use` the class carries now is the composition pipe,
  which takes an installer.

  The eight dropped instance proxies each need a by-hand move to `i18n.core.*`: the receiver's
  type is textually undecidable, so `i18n.reloadMessages()` may be a `VueI18n` proxy or an
  already-correct raw core instance, and only you can tell which.

  **Also fixed (no app change needed).** `@comvi/vue` no longer inlines copies of core's tag
  and translate chunks into its own bundle, and `<T>` is its own dist chunk with a
  `/*@__PURE__*/` factory call — so a vue app that never renders `<T>` no longer ships the tag
  machinery, and no vue bundle runs core's ambient `registerTagSyntax()` at all. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md).

- 09029b0: **BREAKING (breaking change on a 0.x minor): `createI18n` from `@comvi/vue` now builds the base instance.** Vue's `createI18n` is a real preset — it constructs a `VueI18n` around a `@comvi/core` instance and applies `ssrLocale` before the reactive ref is seeded — and in 0.4 the instance it constructed arrived with ICU, tag syntax, async loading, the plugins capability and devtools discovery already attached. Those five are now things you compose. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

  **Grep target for a tree built against 0.5 development:** the retired subpath was `@comvi/vue/slim`. Drop the suffix — the surviving entry is a superset of everything that one exported that still exists, and it never published, so there is no deprecation debt.

  Nothing about the preset itself changes: same call signature, same `ssrLocale` handling,
  same `VueI18n`, same `app.use(i18n)` install, same composables, same `<T>`, same
  `I18N_INJECTION_KEY`, and `createI18nFromCore` is the untouched escape hatch for an instance built
  elsewhere — with `createI18n` from `@comvi/core` now, since the `createCore` alias is gone
  (`vue-drop-create-core.md`).
  **Where the pipe goes on vue:** on the `createI18n` result. `VueI18n` has its own
  `.use(installer)`, which runs the installer on `i18n.core`, hands back the same instance and
  widens the type of `core` by what was composed — so the chain reads like the react, solid and
  svelte one. The one shape that still differs is registration: the wrapper does not proxy plugin
  registration, so a plugin goes to `i18n.core.registerPlugin(…)`, or into the chain as
  `.use(definePlugin(p))`.

  | you had                                      | you add                                                   |
  | -------------------------------------------- | --------------------------------------------------------- |
  | ICU plurals, select, selectordinal           | `compiler: icuCompiler` in the constructor options        |
  | loader (`registerLoader`, …)                 | `createI18n(options).use(loader(map))`                    |
  | `.use(plugin)`, `onMissingKey`               | `.use(definePlugin(p))`, or `i18n.core.registerPlugin(p)` |
  | discovery (`instanceId`, `window.__COMVI__`) | `.use(devtools({ instanceId }))`                          |
  | `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`              |

  ```ts
  // INLINE — the preset ingests the catalog.
  const inline = createI18n({ locale: "en", compiler: icuCompiler, messages });

  // REMOTE — the same option; the loader composes on the result.
  const remote = createI18n({ locale: "en", ssrLocale: "en", compiler: icuCompiler }).use(
    loader(importMap),
  );
  ```

  `compiler` is a constructor field held for the instance's life, so one option covers every
  catalog source. The one ordering rule left is vue's own: compose before `app.use(i18n)`.

  **`<T>` changed seams.** It used to import `@comvi/core/tags`, the side-effectful subpath, so
  rendering `<T>` anywhere also switched tag syntax on for every plain `t()` call — and off
  again in any production build that pruned the component. It now imports the pure
  `@comvi/core/rich-text` seam: rich-text rendering is unchanged, the accidental ambient switch
  and its dev/prod divergence are gone, and `t("Click <b>here</b>")` stays literal until you
  `import "@comvi/core/tags"` once at your own entry. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §3 and
  `core-single-entry-convergence.md`.

- 09029b0: **BREAKING (breaking change on a 0.x minor): `useI18n()` no longer returns `hasTranslationNow` / `hasLocaleNow`.** In react, solid and svelte `hasTranslation` and `hasLocale` ARE the non-reactive form, so vue's composable carried two extra names for what one name means everywhere else. The pair is unchanged on the `VueI18n` class: `inject(I18N_INJECTION_KEY)!.hasTranslationNow(key, opts?)` inside `setup()`, or any reference you already hold to the instance `app.use(i18n)` installed. Vue's reactive `hasTranslation(key, opts?)` / `hasLocale(locale, ns?)` — which return a `ComputedRef` and must be called in a reactive scope — are untouched.
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

- 09029b0: The catalog cache returned by `useI18n()` is `messagesCache`; `translationCache` is removed.
- 09029b0: The README and API examples seed inline catalogs with `createI18n({ messages })`, switch locale with `await setLocale()`, and load from the CDN with `import { cdnLoader } from "@comvi/plugin-fetch-loader"`, matching `@comvi/core`.
- 09029b0: `<T>` now consumes the shared `prepareTranslation` pipeline from the pure
  `@comvi/core/rich-text` seam instead of its own duplicated marker transport. Rendering,
  slots-as-handlers, the `components` prop (string, `{ component, props }` config, and Vue
  component forms) and reserved-prop forwarding all behave as before.

  **New: a default-slot fallback for missing translations.** When a key has no translation in
  the locale chain and no `fallback` prop is set,
  `<T i18nKey="maybe.missing">shown instead of the key</T>` renders its default slot instead
  of the raw key — parity with the react / solid / svelte children fallback. Without a default
  slot the key still renders, and the `fallback` prop still wins over the slot.
  `hasTranslation`-based detection means the slot is consulted only for genuinely missing
  keys.

  The seam matters: `<T>` first took the shared pipeline from `@comvi/core/tags`, the
  side-effectful subpath, so rendering `<T>` anywhere also switched string-API tag syntax on
  for every plain `t()` call — and off again in any production build that pruned the
  component. The pure entry re-exports the same toolbox and registers nothing, so tag
  interpolation inside `<T>` is unchanged while `t("a <b>c</b> d")` is consistently literal
  until the app imports `@comvi/core/tags` itself.

  Also removes the package-local `translationResultToString` copy in favour of the identical
  export from `@comvi/core`.

- 09029b0: `useI18nLoader()` now hands out `removeActiveNamespace(ns)` and `removeActiveNamespaces(ns[])`
  alongside `addActiveNamespace(s)`.

  They are core's new deactivation: the namespace leaves `getActiveNamespaces()`, its in-flight
  load is cancelled, and a `configChanged` event re-renders anything reading the active set.
  Content already in the cache is untouched — `clearMessages()` is content-only in every form
  now, so it no longer deactivates anything.

- 09029b0: **Added: the `@comvi/vue` entry carries the whole toolkit** — all three construction paths
  included — so an app names one package, where it used to take the instance constructor from
  `@comvi/core` and the bindings from `@comvi/vue`.

  ```ts
  // one call: a VueI18n over a base instance
  const plain = createI18n({ locale: "en", messages: { en: { hi: "Hi" } } });
  createApp(App).use(plain).mount("#app");

  // composed: `.use(…)` runs the installer on the instance and widens `i18n.core`
  const composed = createI18n({ locale: "en", ssrLocale: "en" }).use(loader(importMap));
  composed.core.reloadMessages(); // typed: the loader is on `core`

  // instance built elsewhere: core's own constructor, imported from @comvi/core
  // (`import { createI18n as createCore } from "@comvi/core"`)
  const core = createCore({ locale: "en" }).use(loader(importMap));
  const wrapped = createI18nFromCore(core, { ssrLocale: "en" }); // wrapped.core is exactly `core`
  ```

  | export                                            | what it is                                                                     |
  | ------------------------------------------------- | ------------------------------------------------------------------------------ |
  | `createI18n`                                      | the preset — a `VueI18n` over a base instance, with `.use(…)` on it            |
  | `createI18nFromCore`                              | unchanged — wraps that instance, preserving its exact type                     |
  | `I18n` (type only)                                | the base class `createI18n` produces — a runtime value only from `@comvi/core` |
  | `icuCompiler`                                     | from `@comvi/core/icu` — the ICU compiler                                      |
  | `loader`, `attachLoader`                          | from `@comvi/core/loader`                                                      |
  | `plugins`, `definePlugin`                         | from `@comvi/core/plugins`                                                     |
  | `devtools`                                        | from `@comvi/core/devtools`                                                    |
  | `VueI18n`, the composables, `<T>`, the inject key | unchanged                                                                      |

  Vue is the one binding whose preset is a real function — there is a `VueI18n` to construct,
  and `ssrLocale` has to reach the instance before the reactive ref is seeded — so `createI18n`
  here is vue's own factory and core's constructor keeps a name of its own. `createI18n` takes
  the same option shape it always did, `ssrLocale` and `compiler` included, and returns
  `VueI18n<D, I18n<D>>` over the BASE `I18n`, so `i18n.core` is typed without the capabilities
  it does not have; the eight dropped proxies stay dropped. The composition pipe goes on that
  wrapper: `createI18n(options).use(loader(map))` composes on the instance underneath and retypes
  `core` to match.

  `attachPlugins` / `attachDevtools` are deliberately NOT among them: they are the low-level
  pair `plugins()` / `devtools()` already configure, and they stay on `@comvi/core/plugins` and
  `@comvi/core/devtools` (see `roots-drop-attach-pair.md`).

  The re-exports cost nothing: they are **named** re-exports of core's own bindings
  (`vue.attachLoader === attachLoader`), from core's pure subpaths only — never `export *`,
  which is exactly what this entry used to carry, and never through another wrapper.
  `@comvi/core/tags` is deliberately not among them: importing it registers tag syntax
  ambiently, and `<T>` uses the pure `@comvi/core/rich-text` seam instead.

  **One entry, one injection key.** The package publishes exactly one entry, so there is one
  build pass and one `Symbol("i18n")`: a plugin installed with `app.use(i18n)` and a
  `useI18n()` in the same app always see each other. No 0.4.x import specifier changes.

  **Nine 0.4.x named VALUE exports go, though.** Replacing `export * from "@comvi/core"` with
  named re-exports plus `export type *` drops `MessagesCache`, `createBoundTranslation`,
  `translationResultToString`, `formatNumber`, `formatDate`, `formatCurrency`,
  `formatRelativeTime`, `getTextDirection` and `createElement` from this entry's value surface.
  Types are unaffected. `useI18n()` returns the four formatters and `dir` already bound to the
  locale, and all nine are still exported by `@comvi/core`, so each is a one-line import move;
  the mapping is tabled in the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §3.

- 09029b0: `<T>` now takes interpolation params as plain attributes, the way `@comvi/react`'s `<T>` always
  has.

  ```vue
  <T i18nKey="cart.items" :count="2" name="Ada" />
  ```

  Anything that is not one of `<T>`'s own props (`i18nKey`, `params`, `ns`, `locale`, `fallback`,
  `markers`, `components`) is passed to the translation as a param, so a one-value message no longer
  needs a `:params="{ … }"` object. `params` still works and can be combined with attributes; on a
  name collision the attribute wins, matching react.

  Write direct params in **camelCase**: Vue camelizes declared props only, so `:max-count="2"`
  arrives as a param named `max-count`, while `:maxCount="2"` arrives as `maxCount`.

  The component now sets `inheritAttrs: false`, so an attribute is never also written onto the
  rendered markup — and Vue no longer logs "Extraneous non-props attributes" for a `<T>` that
  renders text or a fragment. That includes `class`, `style` and `v-on` listeners: they are
  attributes, so on `<T>` they become translation params rather than reaching the markup. Put them
  on an element around `<T>` instead.

- 09029b0: **`createI18n(options).use(installer)` composes capabilities on the wrapper.** `VueI18n` gains `.use(installer)`: it runs the installer on `i18n.core`, returns the same instance, and widens the type of `core` by what the installer composed — so a Vue app reads like the React, Solid and Svelte ones:

  ```ts
  const i18n = createI18n({ locale: "en", fallbackLocale: "en", compiler: icuCompiler }).use(
    cdnLoader({ cdnUrl }),
  );

  i18n.core.reloadMessages(); // typed: `.use` widened `core`
  createApp(App).use(i18n).mount("#app");
  ```

  `createI18nFromCore` stays as the escape hatch for an instance built elsewhere — built with `createI18n` from `@comvi/core`, the `createCore` alias being gone (`vue-drop-create-core.md`); Nuxt's `i18nModule` uses it; it is no longer the recommended way to compose. ICU is not composed at all: it is `compiler: icuCompiler` in the options, whatever the catalogs come from. The one ordering rule is vue's own: compose before `app.use(i18n)`, because `install` starts `init()`, which drains the plugin queue once (development warns on a later `.use`). An installer that returns a different object than the instance it was given is refused with an error whose `code` is `E_USE_INSTANCE_IDENTITY` (`[@comvi/vue] .use(installer) must return the instance it was given` in development).

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

- 09029b0: Four lifecycle fixes for a `destroy()` that races an operation already in flight, plus one
  loader bug that needed no race at all.

  `init()` used to finish on an instance that `destroy()` had already torn down: it read the
  destroyed flag only on entry, so a `destroy()` landing during plugin initialization or the
  initial namespace load still ended with `isInitialized === true`, an `initialized` event, and
  the active namespaces and catalog put back after destroy had cleared them. It now re-checks
  after every await and resolves quietly instead — `isInitialized` honestly stays `false`, and no
  error is reported, because the usual cause is a component that unmounted while its provider's
  `init()` was still running.

  A plugin cleanup that arrived after `destroy()` had drained the queue used to be dropped
  without ever running or reporting — a subscription or interval the plugin owned stayed alive
  for the life of the page. Such a cleanup now runs, and a throw from it is reported exactly as
  any other cleanup's is. In the same pass, `destroy()` during plugin initialization no longer
  starts the plugins that had not begun yet, or the locale detector after them. One boundary
  worth knowing: that late cleanup is awaited by the `init()` promise, not by `destroy()`, so
  `destroy()` never hangs waiting for a plugin that is still starting up — await the `init()`
  promise as well if you need both to have finished.

  A repeat `destroy()` used to resolve immediately while the first call was still running the
  cleanups, so a second caller — a component unmounting twice, a server instance torn down by two
  paths — was told the teardown had finished before it had. Every call is now the same attempt
  and resolves when that one teardown has actually settled.

  A locale switch that was in flight when `destroy()` landed used to apply anyway, changing
  `locale` and emitting `localeChanged` on a destroyed instance. A pending switch is now abandoned.

  A loader that threw SYNCHRONOUSLY (rather than returning a rejected promise) used to poison
  its namespace: the failure reported correctly the first time, but a rejected promise was left
  parked under the load's key, so every later attempt got that same rejection back, the loader
  was never called again, and the namespace could not load even after the loader was fixed. A
  synchronous throw now behaves exactly like a rejected promise and the next attempt calls the
  loader again.

  Also: the dev warning for a `registerPlugin()` / `.use(plugins())` after `init()` said the
  plugin "will never run". It still warns — registering late is still almost always a mistake —
  but it now says what actually happens: the plugin does not run now, and the next `init()`
  drains it along with everything already queued, accumulating another set of cleanups. The Vue
  wrapper's equivalent warning says the same. Behaviour unchanged.

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

- 09029b0: `UseHostIdentityError` is now `UseInstanceIdentityError`.
- 09029b0: `t()` reports a wrong call on the first line: one call signature instead of three overloads. No
  runtime change.

  With typed keys generated, every mistake used to open with TS2769 "No overload matches this call"
  followed by the failure of each overload in turn, and the one useful line came last. A forgotten
  required parameter was worse — "Argument of type '\"welcome\"' is not assignable to parameter of
  type 'null'" — because the only overload that accepted a single argument was the permissive one,
  whose key parameter is `never` once the registry is closed.

  `t` and `tRaw` now have ONE signature. The key parameter is `AcceptedKey`, the union of the keys
  that call site may use, and `ArgsFor` dispatches the params on the key that was passed, so
  TypeScript names the actual problem:

  | the mistake                   | before                             | now                                                |
  | ----------------------------- | ---------------------------------- | -------------------------------------------------- |
  | unknown key                   | TS2769, 7 lines                    | TS2345, 1 line, naming the declared keys           |
  | required param forgotten      | TS2345 "not assignable to `null`"  | TS2554 "Expected 2 arguments, but got 1"           |
  | wrong params                  | TS2769, 8 lines                    | TS2345, 2 lines, the second naming what is missing |
  | wrong param value             | TS2769, 7 lines                    | TS2322, 1 line                                     |
  | bare key of another namespace | TS2345 "not assignable to `never`" | TS2345, naming the keys the call site can use      |

  The last row is why the key union depends on the namespace in scope rather than holding every
  namespace's bare keys. A bare key is only meaningful next to the namespace that declares it, and
  there are two ways to supply one: `useI18n("admin")` binds it at the call site, and an explicit
  `{ ns: "shop" }` names it in the params. So `useI18n("admin").t("checkout")` is rejected on the KEY,
  naming `admin`'s keys, while `t("checkout", { ns: "shop" })` compiles unchanged.

  The key sets, the namespace-bound narrowing of `useI18n(ns)`, the `{ ns }` form, the qualified
  `"ns:key"` spelling on the core instance, the `t(null)` no-op, a runtime `ns`, and the permissive
  path for a project with no generated types all behave exactly as before. `TranslationKeys`,
  `Namespaces`, `NamespacedKeys`, `DefaultNsKeys`, `PermissiveKey`, `ParamsArg`,
  `NamespacedParamsArg`, `NamespaceBoundParamsArg` and `MissingParams` keep their meaning.
  `AcceptedKey`, `AcceptedCoreKey` and `ArgsFor` are new exports, which is why this is a minor.

  Three type-level shapes DO change, all of them consequences of there being one signature rather
  than an overload set that could instantiate its key parameter to `string`. All three are listed in
  `docs/design/limitations.md`.

  A **union key** — `t(cond ? "greeting" : "farewell")` — now gets loose params and compiles, where
  the overload set rejected it against the permissive overload's `null` key. The key is still
  checked; the params are not. Closing it needs the arms' params intersected, and that costs the
  check on `t("key", { ns })`, which would silently accept a wrong namespace.

  **`Parameters<typeof t>` is `never`** with a closed registry, where it used to be the permissive
  overload's tuple. The key parameter's type depends on a second, inferred type parameter and
  `Parameters` cannot see through that. Reach the argument list through `ArgsFor<"your.key">`, which
  resolves normally.

  **`t` is no longer assignable to a `(key: string) => string` callback** with a closed registry —
  the common "hand `t` to a third-party helper" shape. Cast it: `t as (k: string) => string`. The
  two-argument variant never accepted `t`.

  `@comvi/next`'s `TranslationFunction`, `@comvi/nuxt`'s `ServerTranslationFunction` and
  `@comvi/vue`'s `VueI18n.t` / `tRaw` declared their own copies of the overload set and now declare
  the single signature instead. Their names and behaviour are unchanged.

  `createBoundTranslation(i18n, ns)` threads `ns` into its RETURN type, so the result narrows to that
  namespace's keys — `createBoundTranslation(i18n, "admin")("dashboard")` compiles, which is what its
  own `@example` documents. Bind the namespace with a literal; a `string` variable leaves the result
  unbound and loose, as a runtime namespace always was.

  Also fixed in `@comvi/nuxt`: `useTranslation`'s server `t` passed its runtime string key straight
  to core, which does not type-check once an app generates types. It now uses the `as never` escape
  hatch every binding's `<T>` already uses. Type-level only — the call was always correct at runtime.

- 09029b0: `<T :components>`'s config entry is now core's own type, not a vue-local copy of it.
  - **The `tag` spelling always worked; the declaration said otherwise.** `prepareTranslation`
    resolves an entry through `handler.tag ?? handler.component`, but the vue type hand-rolled
    `{ component: string | Component; props?: … }` — the `component` alias only. The entry type is
    now core's `TagComponentConfig` intersected with the Vue target types, so the two cannot drift
    apart again, and one of the two spellings is required (core's own shape makes both optional,
    which would admit a target-less entry the pipeline does not treat as a config at all).
  - **Nothing new compiles and nothing stops compiling.** Verified against the pre-change union:
    `{ link: { tag: 'a', props: { href: '/help' } } }` already type-checked, because Vue's own
    `Component` type accepts an arbitrary object — which is also why vue, unlike react, still
    accepts entries that name no target. That looseness belongs to `Component` and is unchanged
    here; it is now pinned by a type test so it cannot be mistaken for a regression later.
  - **Follow-up, for parity across the wrappers:** a config entry's `props` is now
    `Record<string, any>` rather than core's `Record<string, unknown>`. An INTERFACE-typed props
    object is not assignable to `Record<string, unknown>` (only type-literal objects are), so the
    stricter type rejected props a caller legitimately holds. `@comvi/react` and `@comvi/solid`
    type this field the same way.
  - Type-only change: no runtime code was touched.

- 09029b0: `destroy()` now returns a promise that resolves when plugin cleanup has finished.

  `VueI18n.destroy()` drives the instance's async `destroy()`, and returned `void`: there was no way to
  wait for a plugin's cleanup — an interval, a socket, a subscription — to actually finish, which a
  test tearing an instance down between cases and a request-scoped instance on the server both need.
  `await i18n.destroy()` (and `await destroy()` from `useI18n()`, in `@comvi/vue` and `@comvi/nuxt`)
  now means the cleanup is done. Fire-and-forget callers are unaffected: the promise RESOLVES even
  when the instance's cleanup rejects, and that error still reaches `onError` with source
  `"plugin-cleanup"`. A repeat call returns the same promise rather than tearing down twice.

- 09029b0: **Development build: the dev-only diagnostics now actually fire under a bundler's development condition.** The `IS_DEV`-guarded late-compose warning `VueI18n.use` logs when a capability is composed after `app.use(i18n)` has started `init()` was dead code in the published package, and had been since it was written. `__DEV__` is a build-time define of OUR build, `vite build` pins `NODE_ENV=production`, and the package published exactly ONE artifact, so the only file a consumer could resolve had `__DEV__: false` baked in no matter what mode the app built in. `dist/comvi-vue.dev.js` (and its chunks) now ships alongside the production artifact, and `exports["."]` answers the `"development"` condition with it — the pattern `@comvi/core` already used for its readable error messages. A vite dev server, a `NODE_ENV=development` vite build and `webpack --mode development` resolve it and log the warning; every other consumer resolves `default` and gets the production artifact, which is byte-for-byte what it was — no row of the size gate moved, and `types` is unchanged and shared by both. The claim is gated on the DIST from now on: the bundler-matrix `vue-dev-conditions` case bundles a consumer that defines nothing, once per mode per bundler, and asserts the warning text is in the development bundle and out of the production one.
- 09029b0: Reactive `hasLocale()` no longer goes stale when the default namespace changes. It tracked only
  the translation-cache revision, but with no explicit namespace the instance resolves against the
  default namespace — config, not cache — so after `setDefaultNamespace()` the computed kept its
  old value and disagreed with `hasLocaleNow()`. It now also tracks the config revision, like
  `hasTranslation()` already did.
- 09029b0: Internal dedupe, behavior-preserving: the `VueI18n` constructor's event→reactivity bridge now consumes core's canonical `subscribeToRevision` helper (an event-name switch preserves the exact per-event semantics for the locale/loading/cache/config refs); `UseI18nReturn`'s `t`/`tRaw` overload blocks are replaced by core's `TranslateFn` type (inference unchanged).
- 09029b0: The `locale` ref now mirrors the core when an `ssrLocale` catalog is still loading or fails to load, instead of reporting a locale the instance is not in; the two `.use(installer)` texts say "i18n instance".
- 09029b0: `setLocale()` and the `locale` ref now supersede a locale switch that is still loading, including a pending `ssrLocale`, so the last request wins.
- 09029b0: `<T>` no longer breaks the build of apps that generate translation types.
  - **Any key-closed program failed to compile.** `<T>` resolved its key at runtime and passed a
    plain `string` to `i18n.tRaw`, but closing `TranslationKeys` — what `comvi typegen` produces —
    narrows `tRaw`'s overloads to the registered literals, and to `never` for the namespaced one.
    A `string` matches none of them, so `src/components/T.ts` itself failed to type-check inside
    every consumer app that had generated types, while the package's own build (keys open,
    permissive fallback) stayed green and never showed it. The key is now passed as `never`, the
    same idiom `@comvi/react` and `@comvi/solid` already use for runtime keys.
  - Guarded by a second, isolated tsc program that compiles `src` with the key registry CLOSED.
    It has to be its own program: `declare module` is global to whichever program contains it, so
    a key-closing augmentation placed in the main test project would narrow every sibling test's
    runtime-string call instead. `@comvi/react`, `@comvi/solid` and `@comvi/svelte` were checked
    the same way and are clean.
  - Type-only change: no runtime code was touched.

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

- 641245b: Fix three binding bugs found in the fleet-wide package audit:
  - **nuxt**: replaced the Nuxt 2-era `process.dev` with `import.meta.dev` in `useSwitchLocalePath` so the invalid-locale dev warning actually fires.
  - **vue**: `formatNumber`/`formatDate`/`formatCurrency`/`formatRelativeTime` read the non-reactive core locale, so template usages did not re-render after a locale switch (React binding already behaved correctly). They now default to the reactive locale ref.
  - **plugin-locale-detector**: cookies written with `sameSite: "none"` but no `secure` flag are rejected by modern browsers; `Secure` is now forced for `SameSite=None`.

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

- c473f32: Add the Vue 0.3 reactive API surface for loaded locales, active namespaces, default namespace, reactive hasTranslation/hasLocale helpers, and config-change-aware translation recomputation. This intentionally changes pre-1.0 composable return shapes; consumers should read `.value` from reactive helpers.
- 4050429: CORE reactivity fixes from the v0.3 review:
  - **core (L3):** `addTranslations()` no longer emits `configChanged` for runtime-added translations — it relies on the `namespaceLoaded` event (and the cache-revision bump) that `_nsAddTranslations` already fires, removing a redundant double re-render. **Behavior note:** if you have an external `on("configChanged", …)` listener that was reacting to `addTranslations`, switch it to `on("namespaceLoaded", …)`. `configChanged` is still emitted for fallback-locale and namespace-activation changes. An empty `addTranslations({})` is now a true no-op.
  - **core (L1):** the `Intl` formatter caches (number/date/relative-time) are now bounded (FIFO eviction at 1000 entries), mirroring the template cache. Prevents unbounded growth for apps formatting many distinct `(locale, options)` combinations via the per-call `locale` override.
  - **solid & svelte (M4):** the cache-revision signal/store now uses a single monotonic counter instead of summing two independent counters, which could collide non-monotonically and drop a re-render (e.g. a `configChanged` that didn't change the translation cache).
  - **vue (M1):** added imperative, non-reactive `hasTranslationNow(key, opts?)` and `hasLocaleNow(locale, namespace?)` returning plain booleans — for use in loops/handlers where the reactive `hasTranslation()`/`hasLocale()` (which allocate a `computed()` per call) would leak outside an effect scope. Re-exposed through `@comvi/nuxt`'s `useI18n()`.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

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
