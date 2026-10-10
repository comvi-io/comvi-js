# @comvi/core

## 0.5.0

### Minor Changes

- 09029b0: **BREAKING (breaking change on a 0.x minor): `clearMessages(undefined, ns)` no longer
  deactivates the namespace.** Every form of `clearMessages(locale?, namespace?)` now clears
  CONTENT only. Deactivation is the new `removeActiveNamespace(ns)` on the loader capability.

  The namespace-scoped clear deactivated because nothing else could: there was no public way to
  stop serving a namespace, so the one call had to mean both things. That made the two scopes
  disagree — a scopeless clear kept intent, a named one dropped it — and it made "drop this
  namespace's catalogs and fetch them again" impossible to express.

  | call                           | 0.5.0-rc before                     | now                                 |
  | ------------------------------ | ----------------------------------- | ----------------------------------- |
  | `clearMessages()`              | content of every scope; intent kept | unchanged                           |
  | `clearMessages(locale)`        | content of that locale; intent kept | unchanged                           |
  | `clearMessages(locale, ns)`    | content of that scope; intent kept  | unchanged                           |
  | `clearMessages(undefined, ns)` | content **and** deactivates `ns`    | content only — `ns` stays active    |
  | `removeActiveNamespace(ns)`    | did not exist                       | deactivates `ns`, cancels its loads |

  Migration: call `removeActiveNamespace(ns)` where you relied on the scoped clear to stop loading
  a namespace — add `clearMessages(undefined, ns)` alongside it if you also want its catalogs
  gone.

  `removeActiveNamespace(namespace)` and `removeActiveNamespaces(namespaces)` ship on
  `@comvi/core/loader` beside `addActiveNamespace(s)`. They drop the namespace from
  `getActiveNamespaces()`, so a locale switch never fetches it again and `reloadMessages()`
  fetches only what is still active, and they cancel whatever load is in flight for it so a late
  response cannot repopulate the cache.

  One exception, worth knowing before you rely on the absolute version: `reloadMessages()` with
  NOTHING active left falls back to the DEFAULT namespace. So if the namespace you removed was the
  last active one AND it was the default namespace, a reload brings its content back — while
  `getActiveNamespaces()` stays empty. Remove the last active namespace when it is not the default
  and the reload fetches the default namespace instead, never the one you removed. A locale switch
  has no such fallback and fetches nothing at all.
  They are synchronous — nothing is fetched — and they leave the catalogs already in the cache
  alone, so the namespace keeps resolving until you clear it. Both emit `configChanged` with the
  new `namespaceDeactivated` source, which is what makes a binding reading `getActiveNamespaces()`
  re-render.

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

- 09029b0: **BREAKING (breaking change on a 0.x minor): the root `@comvi/core` entry changes semantics.** `@comvi/core` is now ONE entry — the base instance — and capability is an import you add, never an entry you switch. The second entry, `@comvi/core/slim`, is deleted; it never published, so there is no deprecation debt.

  | what a 0.4 root had                          | on the converged root                 | compose it back                                                     |
  | -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
  | ICU plurals / select                         | dev throws, prod renders it literally | `compiler: icuCompiler` in the constructor options                  |
  | `.use(plugin)`                               | absent — TS error + `TypeError`       | `.use(definePlugin(p))`, or `.use(plugins())` + `registerPlugin(p)` |
  | loader (`registerLoader`, …)                 | absent — the loud capability error    | `.use(loader())`                                                    |
  | discovery (`instanceId`, `window.__COMVI__`) | absent — invisible to the extension   | `.use(devtools())`                                                  |
  | string-API tags (`"<b>hi</b>"`)              | literal text, dev warning             | `<T>`, or `import "@comvi/core/tags"`                               |

  `new I18n(options)` and the batteries-included CDN global are unchanged. `@comvi/next`'s
  `createNextI18n` (now typed `NextComposedI18n<D>`) keeps every capability in the table above
  and loses only its `compiler` default — see that package's own changesets.

  ```ts
  // INLINE catalogs.
  const i18n = createI18n({ locale: "en", messages, compiler: icuCompiler });
  // REMOTE catalogs — the same option, in the same place.
  const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(fetchLoader({ … }));
  ```

  `compiler` is a constructor field held for the instance's life, so one option covers every
  catalog source: a constructor `messages`, an `addMessages` call, a loader merge. The
  library has no ordering rule left, so `loader()`, `plugins()` and `devtools()` may be
  composed in any order among themselves.

  **The ICU failure is structured, and its context is yours.** Development throws where the
  template is COMPILED — at ingestion for catalog strings, at first compile for one that
  bypasses ingestion (a per-call `params.fallback`). Production never crashes: it renders the
  braced segment literally and reports `E_ICU_SYNTAX` through `onError`, or `console.error`
  when no handler is configured, on the compilation that hit it — best-effort, per process,
  never on cached renders. The error owns exactly `code` and a truthful `argumentType`; key,
  namespace and locale reach you through the report context, as
  `{ source: "compile", key, namespace, locale }`.

  **BREAKING for plugin authors: a plugin may only return nothing or a cleanup function.**
  `init()` used to ignore any non-function return and now throws on any non-`undefined` one,
  through the plugin lifecycle's normal error path. The shape that bites is the
  expression-bodied arrow:

  ```diff
  -i18n.registerPlugin(() => (ready = true));   // returns `true` — now throws
  +i18n.registerPlugin(() => { ready = true; }); // returns nothing — fine
  ```

  Residuals: nested catalogs are flattened by the BASE instance, unconditionally, so they need no
  composition at all, and `flattenCatalog` is exported from the `@comvi/core` root only — for
  pre-flattening data by hand, not as the answer to a rule;
  `@comvi/core/rich-text` is the pure `<T>` toolbox and `@comvi/core/tags` still registers
  string-API tag syntax; `instanceId` is absent unless devtools is composed, and the
  loader/plugin members are no longer on the prototype chain. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md).

- 09029b0: `@comvi/core/loader` now exports `acquireLoaderApi(instance)` and `@comvi/core/plugins` exports `acquirePluginsApi(instance)`: given an i18n instance, each returns the component-driveable slice of its capability — the loader's namespace-activation and reload members, the plugins capability's `onMissingKey` — or throws `missingCapability(...)` when the capability was never composed on, in development and in production alike. The returned bag is cached per instance, so two callers holding the same instance get the same function references.

  This is the implementation the four framework bindings' `useI18nLoader()` / `useI18nPlugins()` used to carry a copy of each. It sits on the capability subpaths and not on the `@comvi/core` root, so an app that never acquires a capability does not carry the acquisition: `core-base` is unchanged to the byte.

- 09029b0: `AnyI18nInstance` — the instance type a provider accepts, whatever `defaultParams` type it carries, with the `strictFunctionTypes` invariance write-up — is declared once in `@comvi/core` and re-exported as a type by `@comvi/react`, `@comvi/solid` and `@comvi/svelte`, instead of three identical copies. No shape change; `scripts/wrapper-hooks-parity.test.mjs` now fails on a local re-declaration.
- 09029b0: `@comvi/core` is compiled with `useDefineForClassFields: false` — a smaller bundle on every
  entry, with no logic change.

  **Behaviour is identical. Reflection is not**, in two ways, and both matter only if you
  enumerate or serialize an instance:
  1. **A declared-but-unassigned field is no longer an own property.** The one public member
     this is observable on is `instanceId`: on an instance that never exposed itself
     (`exposeGlobal: false`, or any server render) `Object.keys(i18n)` and `{ ...i18n }` no
     longer list it, where they used to list it holding `undefined`. `i18n.instanceId` still
     reads `undefined`.
  2. **Own-property order is assignment order**, not declaration order — the same sequence as
     before for the public keys, so a consumer reading them positionally sees no change.

  Every public method and accessor is still a non-enumerable prototype member with unchanged
  descriptors, and a spread copy still carries data only.

- 09029b0: Core enablers for framework bindings running on the base `@comvi/core` instance.
  - **`WrapperI18nInstance<D>`** — the instance surface a framework binding asks of the instance it is given
    (`I18nCoreInstance<D> & I18nCoreExtraApi`, exactly what `class I18n` implements). A base
    instance satisfies it with nothing composed. It is a type, so it costs nothing.
  - **`missingCapability(name)`, `hasLoaderApi(instance)`, `hasPluginApi(instance)`** — the
    shared, loud boundary for an absent capability. The guards are structural and read public
    member names only, so property mangling cannot fool them. `missingCapability` builds the
    error a binding throws at a capability-acquisition call, in development **and** production,
    never a silent no-op: `[@comvi/core] This i18n instance has no loader capability. Compose it:
.use(attachLoader) from "@comvi/core/loader", or loader(map).`
  - **`subscribeToRevision`, `REVISION_EVENTS` and `isVirtualNode`** are exported from
    `@comvi/core`, so a binding that reads reactivity events or sniffs virtual nodes reaches
    them without pulling ambient tag registration into its bundle.
  - **`setLocale`'s race machinery moved to `@comvi/core/loader`** — staleness
    arbitration, mid-flight cancellation and the loading refcount only mean something when a
    load can be in flight. On any instance with the loader capability, behaviour is identical, down
    to the event order (`loadingStateChanged` → `localeChanged` → `loadingStateChanged`), and
    the signature is unchanged everywhere. The one delta is on an instance with no loader
    capability: a locale switch emits `localeChanged` alone, where it also used to emit a
    transient `loadingStateChanged` pair for a load that never happened.

- 09029b0: **`window.__COMVI__` discovery protocol v2.** The v1 registry object
  (`version` / `instances` / `register` / `unregister` / `get`, plus the `COMVI_READY` event)
  is gone, and announcing is a capability now rather than a constructor behaviour.

  An instance that composed discovery — `.use(devtools({ exposeGlobal }))`, the lower-level
  `attachDevtools`, or `.use(inContextEditor())` under the editor package's development
  entry — pushes a `{ v: version, i: instance }` envelope onto a plain queue array at
  `window.__COMVI__`, installing the array when the slot is empty. An instance that never composes
  it reads `instanceId` as `undefined`, touches no global at all, and is invisible to the
  browser extension. Consumers such as the in-context editor drain that array and swap in a
  hook object (`push` / `remove`) to receive later instances; `destroy()` removes the
  instance's own entry.

  **The minimum extension version is 0.5.0.** New core detects a v1 legacy registry and falls
  back to it, and never clobbers a truthy non-conforming global — but an old extension build
  never drains the queue array, so **old extension + new core is the one unsupported
  pairing**. Ship the dual-protocol extension and let it propagate first.

  Migration: anything that read `window.__COMVI__.instances` or listened for `COMVI_READY`
  must drain the queue array instead, swapping in a `push` / `remove` hook for live updates.
  The exported `ComviGlobal` type is replaced by `ComviQueueEntry`, `ComviHook` and
  `ComviQueue`.

- 09029b0: Three tree-shakeable additions to `@comvi/core`, free for non-importers:
  - `TranslateFn<D, R>` — the canonical typed translation call-signature set (namespaced keys,
    default-namespace keys, permissive fallback). Every wrapper's `t` / `tRaw` type is now an
    alias of it instead of a hand-copied overload block; inference is unchanged.
  - `subscribeToRevision(i18n, callback)` + `REVISION_EVENTS` — subscribes a callback to the
    canonical 7-event revision set (`localeChanged`, `namespaceLoaded`, `loadingStateChanged`,
    `initialized`, `messagesCleared`, `defaultNamespaceChanged`, `configChanged`). The
    callback receives the event name, so a bridge with separate reactive axes can route
    without re-declaring the list.
  - `isVirtualNode` is exported from `@comvi/core` (previously `@comvi/core/tags` only), so
    consumers outside the tag graph can narrow `TranslationResult` parts without pulling tag
    machinery in.

- 09029b0: ICU arguments the compiler does not implement now fail the same way ICU syntax already failed on
  the default compiler: development throws at ingestion, production renders the text literally and
  reports `E_ICU_SYNTAX`. The ICU compiler supports `plural`, `selectordinal` and `select` — those
  three only.
  - **An unsupported argument type used to become a parameter name.** `{price, number}` compiled to a
    parameter literally named `price, number`, so the message rendered as `{price, number}` with a
    "Missing parameter" warning that pointed at a parameter you never wrote. It now throws in
    development, quoting the argument, naming the three types that are implemented and giving the two
    ways out: quote the braces, or format the value in your own code and pass the result as a plain
    `{param}`. An argument with no choice list at all (`{n, plural}`) gets the same message. Number,
    date and time formats are not planned.
  - **A malformed choice list used to render a wrong branch or an empty string.** A selector with no
    braced sub-message (`{count, plural, one {one} other oops}`) or a sub-message whose brace never
    closes stopped the parse where it broke and kept whatever had been read so far. Both now throw in
    development, quoting the choice list that could not be parsed.
  - **Production behaviour is unchanged in shape.** Nothing throws at runtime: the braced segment
    renders as written and one `E_ICU_SYNTAX` report reaches your `onError` handler with the key,
    namespace and locale, exactly as it already did for ICU syntax on the default compiler.
  - Development now preflights ingested catalogs with the ICU compiler too, not just the default one,
    so a broken message throws where the catalog was added rather than at first render. Catalogs
    ingested through a compiler you supplied yourself are not preflighted.

- 09029b0: **A loader now fetches the fallback chain, and an empty translation falls through to it.**

  `fallbackLocale` was a lookup rule only. With a loader, `init()` and `setLocale()` fetched the
  active locale and nothing else, so `createI18n({ locale: 'de', fallbackLocale: 'en' })` over a CDN
  rendered a key missing from `de` as the key: the `en` catalog it was supposed to fall back to had
  never been requested. The same held for a `de-AT` → `de` → `en` chain and for a namespace
  activated later.

  A namespace is now loaded for each locale of the fallback chain when it is first needed: at
  `init()` and on `addActiveNamespace(s)()`. `setLocale()` then finds the chain in the cache and
  fetches the target locale alone. A catalog already in the cache, including
  one passed as `messages` or hydrated from a server payload, is not requested again, and a fallback
  equal to the locale costs nothing. A fallback catalog is a safety net and never a requirement: when
  it fails to load, the failure reaches `onLoadError` and `onError` like any other and the operation
  still succeeds. The locale's own catalog keeps its old rule, so `init()` rejects when every
  namespace of the active locale failed. A chain changed with
  `setFallbackLocale()` after `init()` is loaded by `reloadMessages()` or with the next namespace
  that is activated. A fallback catalog that is missing for good is requested once per namespace,
  not on every locale switch.

  **BREAKING (behaviour change on a 0.x minor): an empty string is a missing translation.** A key
  whose stored value is `""` reads as absent everywhere a key is looked up. `t()` renders the first
  non-empty value along the fallback chain where it used to render an empty string, and
  `hasTranslation()` returns `false` for it. A key that is empty in every locale of the chain takes
  the missing-key path exactly like a key that is in none: `missingKey` fires, `onMissingKey` runs,
  a per-call `fallback` is used, and otherwise the key is rendered. This is what a translation
  platform publishes for a value nobody has written yet. Only the stored value is judged: a message
  with text that renders empty for one call, such as an empty plural or select branch, is a
  translation and is returned as is.

- 09029b0: **`loader(importMap)` now REQUIRES the import map, so `attachLoader` is the one attach-only
  loader installer.** One capability had three installers and a decision rule keyed on bundle
  bytes the reader could not see: `loader` names the import-map adapter statically, so a bare
  `loader()` was attach-only and still pulled ~111–124 B min+gz of adapter into the graph, and
  the docs told you to weigh that against typing `attachLoader`. The rule is now one sentence:
  - a static map of import functions → `.use(loader(map))`, which attaches **and** registers it;
  - a plain `LoaderFn` → `.use(attachLoader)`, then `i18n.registerLoader(fn)`.

  **Breaking for a 0.5 pre-release tree only.** A bare `loader()` is a compile error; nothing
  in 0.4 could call it, because neither the installer nor `.use` existed there. A JS caller who
  passes nothing gets a named error at the `loader()` call site — both forms in the message in
  development, the bare code `E_LOADER_IMPORT_MAP` in production — rather than `undefined`
  surfacing inside the import-map adapter on the first load.

  The capability-absence error names the new pair: `[@comvi/core] This i18n instance has no loader
capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).`

  Bundle effect: the import-map adapter is in your graph only when you actually hand over a
  map. The five `full-composite` size rows and the two nuxt rows drop it, because an
  instance with everything composed that registers no map never needed it.

- 09029b0: The catalog cache follows the `messages` naming: the `TranslationCache` class and type are `MessagesCache`, and the instance getter `translationCache` is `messagesCache`. The old names are removed.
- 09029b0: Inline catalogs are now passed as `createI18n({ messages })`, and the catalog methods are `addMessages()`, `getMessages()`, `clearMessages()` and `reloadMessages()`; the `translationsCleared` event is `messagesCleared` and the `FlattenedTranslations` type is `FlattenedMessages`. The old names are removed, and a non-object `messages` throws `E_MESSAGES_NOT_OBJECT`.
- 09029b0: `MessagesMap` is exported from `@comvi/core` and types `addMessages()` and the `messages` option; messages and JSDoc say "i18n instance" instead of "host", and the never-emitted `configChanged` source `"messagesAdded"` is removed.
- 09029b0: Missing interpolation parameters now render as the literal placeholder instead of silently
  disappearing, governed by the new `missingParam` option (default `"literal"`).

  Before: `t("greet")` with `greet: "Hello, {name}!"` produced `"Hello, !"`. Now it produces
  `"Hello, {name}!"`, plus one dev-mode warning per (template, parameter) pair. This aligns
  with ICU MessageFormat and every major i18n runtime, and makes missing data visible instead
  of corrupting copy.
  - A parameter that is absent or `undefined` renders as `{name}` under `"literal"`.
  - A parameter explicitly set to `null` renders as an empty string in BOTH modes — `null`
    stays the intentional-erasure escape.
  - Apps depending on the old silent-drop behaviour can opt out with
    `createI18n({ …, missingParam: "drop" })`.

  The semantics are identical across every render path.

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

- 09029b0: New `prepareTranslation(i18n, props)` — the shared `<T>` pipeline, on the pure
  `@comvi/core/rich-text` seam. It absorbs the plumbing the vue / react / solid / svelte
  wrappers each used to duplicate: marker-based handler transport, `childrenToArray`,
  reserved-prop forwarding (`ns` / `locale` / `fallback` / `markers` override same-named `params`
  keys only when defined) and the missing-translation check. It passes the tag syntax
  extension **per call**, so `<T>` rendering never depends on ambient registration or import
  order. `@comvi/core/tags` re-exports it unchanged beside that registration, and every
  framework `<T>` imports the pure seam.

  Supporting this, `TranslationParams` gains a reserved `tagInterpolation` key: per-call
  tag-interpolation options merged over the instance-level option for that call only
  (`extensions` are unioned, other fields override). It joins `ns` / `locale` / `fallback` /
  `markers` as a call-control key, and is rejected in `defaultParams`.

- 09029b0: `setLocaleAsync()` is renamed to `setLocale()`, which returns a promise that settles once the locale applies; with a loader composed, it first loads the active namespaces. The old name is gone, and assigning `i18n.locale` remains the switch that does not wait.
- 09029b0: New subpath entries decompose the core, so an app pays only for what it composes:
  - `@comvi/core` — `createI18n` with the simple `{param}` compiler only; the `compiler`
    option injects ICU per instance.
  - `@comvi/core/icu` — pure: `icuCompiler`, its only public home.
  - `@comvi/core/tags` — the tag-interpolation toolbox. **Importing it registers tag syntax
    ambiently**, so string-API `t()` parses `<tag>…</tag>` everywhere. Also exports
    `registerTagSyntax()` (returns a disposer), `tagSyntaxExtension` for per-call activation,
    and the VirtualNode helpers.
  - `@comvi/core/loader` — pure: `attachLoader` / `loader()`, `createImportMapLoader`, the
    `acquireLoaderApi(instance)` accessor every binding's `useI18nLoader()` is built on (with its
    `AcquiredLoaderApi` type) and the loader types. (`flattenCatalog` is NOT here: every instance
    flattens nested catalogs itself, and the function stays on the `@comvi/core` root.)
  - `@comvi/core/plugins` — pure: `attachPlugins`, the `plugins()` and `definePlugin(fn, options?)`
    installers, the `acquirePluginsApi(instance)` accessor behind every binding's `useI18nPlugins()`
    (with its `AcquiredPluginsApi` type) and the plugin types.
  - `@comvi/core/devtools` — pure: `attachDevtools(i18n, { instanceId, exposeGlobal })`.
  - `@comvi/core/rich-text` — the pure `<T>` toolbox; `@comvi/core/editor-bridge` — the
    in-context-editor contract module.

  Async loading and plugin registration are not on a base instance: they are absent from the
  module graph, not disabled by a flag, so TypeScript reports their use as a compile error
  rather than letting it fail at runtime. Compose them back with `attachLoader` /
  `attachPlugins` (idempotent, installing **non-enumerable own properties**, so
  `Object.keys()`, spread copies and `JSON.stringify` are unaffected). Three members moved off
  the base surface into `@comvi/core/loader`, where the only code that can exercise them
  lives: `addActiveNamespace`, `addActiveNamespaces` and `onLoadError`.
  `createImportMapLoader` moved there too.

  Tag activation is dual-channel: ambient registration via import, or per call through
  `tagInterpolation.extensions` — the ordering-proof channel `<T>` uses, immune to bundler
  side-effect stripping. `sideEffects` changed from `false` to an array naming exactly the
  tag-registering modules, so everything else still prunes. The template cache keys on
  compiler identity and the effective syntax-extension set, so instances with different compilers
  in one process never poison each other.

  **Scope note:** the base instance is what every framework binding runs on in this release — all
  six accept `WrapperI18nInstance`, so a binding's own graph no longer drags ambient tag
  registration into your bundle. The price is that the loader/plugin members left `useI18n()`
  for `useI18nLoader()` / `useI18nPlugins()`; see each binding's own entry.

- 09029b0: Two more capabilities moved out of the base core into subpaths that compose them back.

  **`@comvi/core/devtools` — browser-extension discovery.** `instanceId`, the
  `window.__COMVI__` handshake and the identity-based removal on `destroy()` are a capability
  now, not core. On a base instance `instanceId` is `undefined` and no global is touched; opt in
  with `attachDevtools(i18n, { instanceId, exposeGlobal })`, which takes the two options the
  0.4 root read off `createI18n`.

  **Tag-grammar escapes moved into the tag extension.** `&lt;`, `&gt;`, `&amp;` and `\<` exist
  to write a literal angle bracket inside a message that IS tag syntax, so they decode exactly
  where `<` decodes. With no tag extension they stay literal: `t("a &lt;b&gt;")` returns
  `"a &lt;b&gt;"`. Any tag extension brings them back and the output is then byte-identical to
  before. **ICU apostrophe quoting is deliberately NOT part of this** — `'{literal}'` and `''`
  are core grammar and keep working everywhere.

  **Nested-catalog flattening is NOT one of them.** It briefly moved into the loader
  capability in 0.5.0 development, and it moved back: every instance flattens a nested catalog
  itself, unconditionally, at the one place a catalog enters. `{ nav: { home } }` and
  `{ "nav.home": … }` are the same catalog in the constructor, in `addMessages()` and in a
  loader result:

  ```ts
  import { createI18n } from "@comvi/core";

  const i18n = createI18n({ locale: "en" });
  i18n.addMessages({ en: { nav: { home: "Home" } } }); // -> "nav.home"
  ```

  A non-string leaf is coerced with `String()` and a `null`/`undefined` leaf is dropped, each
  with a development warning, on every instance. Prototype safety is unchanged. **Not affected:**
  `t()` / `tRaw()`, the template cache, the fast paths, the parser's ICU grammar, and every
  event.

- 09029b0: **Added: `.use(installer)` — the composition pipe — plus the configured capability
  installers `loader()`, `plugins()` and `devtools()`.** Composing a capability used to wrap
  the construction expression; now it continues it.

  ```ts
  const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
    loader({ uk: () => import("./uk.json") }),
  );
  ```

  That one expression replaces `attachLoader(...)`, `createImportMapLoader(map, ...)` and
  `registerLoader(...)`.

  `i18n.use(f)` **is** `f(i18n)` — no registry, no ordering rules, no capability semantics —
  which is why it lives on the base class, is present on every instance, and can never lie about
  what an instance has. An **installer** is therefore any function of the instance, so
  `attachLoader`, `attachPlugins` and `attachDevtools` already are ones and
  `.use(attachLoader)` works.

  | installer            | attaches               | also configures                               |
  | -------------------- | ---------------------- | --------------------------------------------- |
  | `loader(importMap?)` | `@comvi/core/loader`   | registers the import map                      |
  | `plugins()`          | `@comvi/core/plugins`  | nothing yet — the capability takes no options |
  | `devtools(options?)` | `@comvi/core/devtools` | `instanceId` / `exposeGlobal`                 |

  Each lives in its capability's own subpath, so its bytes ride that graph only. **Pick by
  what you have:** `loader` names the import-map adapter statically, so referencing it pulls
  that adapter in whether or not you pass a map — with a map that is what you want; with a
  plain `LoaderFn`, use `.use(attachLoader)` and register it yourself.

  Composing a capability an instance already has is a no-op: no descriptors are copied, no own
  property shadows the inherited prototype member, and registered state is kept.
  Configuration is separate — `.use(loader(map))` on an already-composed instance still registers
  the map.

  Plugin packages are unaffected, and now ALSO ship a bare-name installer each — `fetchLoader`,
  `localeDetector`, `inContextEditor` — which composes the capabilities their plugin needs and then
  routes into the same `registerPlugin`. Nothing is removed: `attachLoader` / `attachPlugins` /
  `attachDevtools` remain the low-level API, and every 0.4.x import path still resolves. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §3.

- 09029b0: `i18n.withMessages(catalogs)` returns a read view whose `t`, `tRaw` and `hasTranslation` read each key from the given `"locale:namespace"` catalogs first and from the cache otherwise, without writing the i18n instance.
- 09029b0: New `@comvi/core/editor-bridge` subpath: the typed contract for the in-context editor
  mappings bridge, previously hand-copied in two places. It exports `EDITOR_MAPPINGS_GLOBAL` /
  `EDITOR_INITIAL_MAPPINGS_GLOBAL` (the property keys on the instance), the `InContextEditorMappings`
  interface, the `toRecordOfNumbers()` payload validator and the `readEditorMappings(instance)`
  guard. The module is pure and invisible to non-importers.

  `@comvi/plugin-in-context-editor` and `@comvi/nuxt` now consume this shared contract instead
  of their local copies. No behaviour change — SSR key-mapping transfer between the editor
  plugin and the Nuxt runtime works exactly as before — but the property keys and bridge shape
  can no longer drift apart.

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

- 09029b0: **`useI18n(ns)` narrows keys in all four bindings.** Solid's namespace-bound `t` / `tRaw` helpers are lifted into `@comvi/core` as `NamespaceBoundTranslateFn<NS, D, R>` (and `NamespaceBoundParamsArg`), and `ns` is now generic in react, svelte and vue: `useI18n("admin").t("dashboard")` is exact for `admin:dashboard` (params typed from the generated key), a key from another namespace is rejected, and the explicit `{ ns }` form is untouched. Before, react, svelte and vue took `ns?: string`, which left no inference site — the same call was a type error even for the namespace's own keys.

  `UseI18nReturn` gains a second type parameter, `UseI18nReturn<D, NS = undefined>` (solid keeps its `<NS, D>` order), and svelte's `SvelteTextTranslationFunction` / `SvelteRawTranslationFunction` take `<D, NS>` likewise. **This can break a caller the loose overload accepted:** a call whose key resolves through the new bound overload now gets that key's own params check — `useI18n("admin").t("settings")` where `admin:settings` declares a required param is rejected instead of falling through — and a hand-written alias that spelled the old one-parameter `useI18n<D>` signature, or assigned `useI18n(ns)`'s result to a type narrower than `UseI18nReturn<D, typeof ns>`, needs the extra parameter.

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

### Patch Changes

- 09029b0: `publishConfig.access` is now declared as `public` in every published manifest.

  `access: "public"` previously lived only in `.changeset/config.json`, so it applied to
  `changeset publish` and nothing else. Any other publish path had to remember `--access public`
  or npm would refuse the scoped package as private. The declaration now travels with each
  manifest. No code changed.

- 09029b0: `addMessages()` now invalidates a pending load for the same locale and namespace, so an older loader response can no longer replace the merged catalog or emit a late `namespaceLoaded`.
- 09029b0: Development now warns when a template-cache key is about to silently truncate.

  The key packs the parse context into two UTF-16 code units: one holds the `#`-is-syntax flag plus
  the extension bitfield, the other holds the compiler id. Both fields are applied through
  `ToUint16`, so anything wider than they hold was dropped without a sound, and two different
  parses could then share one cache entry and serve each other's tokens.

  Two guards, both development only:
  - A `SyntaxExtension` registered with a `cacheBit` above `0x4000` is warned about, because the
    bit does not survive the key and the extension's parses would collide with parses made without
    it. `SyntaxExtension.cacheBit` now documents the 15-bit budget and that `0x4000` is the highest
    usable value.
  - Creating more than 65535 message compilers in one process is warned about — on every compiler
    created past that point, since each one's id wraps. This is reachable by constructing a compiler per request on a
    long-running server; reuse one instance instead.

  The production bundle is byte-identical.

- 09029b0: `clearMessages()` followed by `reloadMessages()` now refetches, instead of quietly doing
  nothing.

  This is the editor-save and webhook-refresh flow: drop everything, fetch it again. A scopeless
  `clearMessages()` used to clear the active namespace set along with the catalogs, so the instance
  no longer knew what it had been serving. `reloadMessages()` then had nothing to reload and
  resolved without a single request, and a following `setLocale()` switched locale without
  loading anything — leaving an app that looked cleared and stayed cleared.

  A scopeless clear now drops content and keeps intent, so both calls work again. What changed:
  - `clearMessages()` leaves `getActiveNamespaces()` untouched.
  - `reloadMessages()` on an instance with no active namespace left reloads the default namespace and
    says so in a development warning, rather than resolving as a no-op.

  If you relied on a scopeless `clearMessages()` to deactivate namespaces, call
  `removeActiveNamespace(ns)` instead — no form of the clear deactivates any more.

- 09029b0: Three composition-hardening fixes on the base instance.
  - **Composing or registering after `init()` warns in development.** `.use(loader())`,
    `.use(plugins())` and `registerPlugin()` on an initialized instance used to succeed silently while
    the plugin queue never ran and the initial namespace never loaded. Development now emits one
    warning per instance naming the rule ("compose capabilities before `init()`"); production behaviour
    is unchanged.
  - **A plugin on an instance with only the plugins capability gets the actionable capability error in development.**
    A plugin that calls `registerLoader` on an instance with no loader composed now fails with
    `[@comvi/core] This i18n instance has no loader capability. Compose it: .use(attachLoader) …`
    instead of a bare `TypeError`. Production keeps the bare `TypeError` — still loud — and
    carries none of the shim code.
  - **`attachDevtools` no longer swallows an `exposeGlobal` flip.** Idempotency is keyed on
    the assigned `instanceId`, so `.use(devtools({ exposeGlobal: false }))` followed by
    `.use(devtools({ exposeGlobal: true, instanceId }))` announces once, with the requested
    id. An already-announced instance is never re-announced, the first id wins, and `destroy()`
    still removes the entry.

- 09029b0: `I18nOptions` no longer demands `defaultParams` from an instance that was written down by type.

  Naming an instance's type instantiates `D` with its own constraint, whose `keyof` is `string`, so the
  `string extends keyof D` arm of `I18nOptions<D>` decided — and that arm required the option. Every
  annotated position therefore failed to compile without a `defaultParams` nobody meant to configure:

  ```ts
  // error TS2322: Property 'defaultParams' is missing in type '{ locale: string; }'
  const i18n: ReturnType<typeof createI18n> = createI18n({ locale: "en" });
  const options: ConstructorParameters<typeof I18n>[0] = { locale: "en" };
  ```

  That arm exists to keep an index-signature `D` out of the type's `never` branch —
  `OptionalKeys<Record<string, V>>` is `string`, not `never` — and not to demand the option: an index
  signature promises no particular key, so there is nothing for the instance to guarantee. It is now
  `defaultParams?: D`, and the annotated forms above compile.

  Unchanged: a `D` whose keys are statically known and all required still has to supply them
  (`createI18n<{ formality: "formal" | "informal" }>({ locale: "en" })` is still an error), a `D` with
  optional keys is still rejected outright, and inference from a passed `defaultParams` is untouched.

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

- 09029b0: A plugin or locale detector that rejects after `destroy()` no longer rejects or reports the interrupted `init()`, which now resolves quietly as it does for any mid-init teardown.
- 09029b0: The auto-generated `instanceId` is now counted once per page rather than once per copy of
  core. The `comvi-<n>` counter was module scoped, so two copies of `@comvi/core` on one page
  (a CDN global plus a bundled npm copy, or a binding pinned to another patch) both minted
  `comvi-1`, and a consumer keyed on the id could only ever see one of the two. The sequence
  lives in a `Symbol.for("comvi.core.instanceCounter")` slot on `globalThis`, the same
  cross-copy channel the duplicate-copy guard uses, so the second copy mints `comvi-2`. The id
  format is unchanged, an explicitly passed `instanceId` is used as given, and minting never
  reads `window.__COMVI__`, so a page-supplied hook cannot influence, break or stall
  construction.
- 09029b0: `destroy()` now probes the `window.__COMVI__` global in the same order exposure does:
  `Array.isArray` first, then a hook object's `remove`, then the v1 registry's `unregister`.
  Consulting `remove` first meant that on a page which extends `Array.prototype` with a
  `remove(index)` polyfill, a raw queue array was handed the entry OBJECT instead of being
  spliced by identity: the polyfill coerced it to index 0 and dropped another instance's live
  entry, with nothing thrown. A consumer hook that masquerades as an array is unaffected, its
  own `remove` still receives the entry.
- 09029b0: **Development now tells you when two versions of `@comvi/core` are loaded.**

  A framework binding depends on an exact `@comvi/core` version. Install
  `@comvi/core` yourself at a different patch and your app ends up with two
  copies — and everything core keeps at module scope belongs to one copy each:
  ambient tag registration from `@comvi/core/tags`, the `window.__COMVI__`
  devtools handshake, and the template cache. Half the app then behaves as if the
  feature was never registered, silently.

  The copy that loads second now says so once, naming both versions:

  ```
  [@comvi/core] Two copies of @comvi/core are loaded, 0.4.0 and 0.5.0. Ambient tags
  (@comvi/core/tags), the window.__COMVI__ devtools handshake and the template
  cache belong to one copy each and will not be shared. Align the @comvi/core
  version your framework binding depends on with the one you installed directly.
  ```

  The check compares versions, so re-evaluating the same copy — which a test
  runner resetting its module registry and a dev server rebuilding a module graph
  both do routinely — says nothing. Two copies at the _same_ version are not
  reported either.

  Development only. Production ships neither the check nor the message, and the
  measured production size is unchanged.

- 09029b0: The constructor and `setFallbackLocale()` now copy the fallback array they receive, and accept `readonly string[]`, so mutating the caller's array no longer changes translations without `configChanged`.
- 09029b0: `t(key, { fallback })` no longer renders an empty string when the fallback text is identical to a static catalog value that was already translated (the static-template cache placeholder was being rendered through the token path).
- 09029b0: The `flattenCatalog` documentation now states that only a null-prototype object whose values are all strings is returned without a copy.
- 09029b0: An ICU plural whose branch holds markup, a parameter or a quoted literal no longer fills the shared
  template cache with one entry per count.

  `{count, plural, other {<b>#</b> messages}}` used to substitute the count into the branch text
  before re-parsing it, so `<b>1</b> messages`, `<b>2</b> messages` and every other count each became
  their own cache entry. On a page that shows a range of counts the plural branches alone could
  evict everything else out of the 1000-entry cache, and every count paid a fresh parse. The branch
  now reaches the parser unchanged and `#` resolves at render time, so one entry serves every count.

  Rendering is unchanged, including the cases that make `#` subtle: a nested plural rebinds `#` and
  the outer count is restored after it, a `#` that arrives inside a parameter value is left alone, a
  quoted `'#'` stays literal, and a `#` inside a `select` branch still resolves against the plural
  that encloses it. The common `{count, plural, one {# item} other {# items}}` shape keeps its
  existing fast path and still parses nothing at all, at the same cost as before: the substitution
  on that path is measured by `pnpm perf`, whose plural case is within noise of the previous release.

- 09029b0: A failed `init()` now runs the cleanups its own plugins returned, in reverse order, before rejecting, so a rejected or retried instance no longer keeps their resources.
- 09029b0: An `init()` called from a synchronous `loadingStateChanged` listener now joins the attempt already in flight instead of starting a second one.
- 09029b0: Concurrent `init()` calls now share one in-flight attempt, so plugins run once and `isInitializing` stays true until that attempt settles.
- 09029b0: A plugin that exceeds its timeout no longer leaks the cleanup it returns later: the cleanup is queued while the instance is live and runs at once after a failed `init()` or `destroy()`, and an invalid late return is reported through `onError`.
- 09029b0: The plural-rules cache is now bounded at 1000 entries instead of growing forever.

  `getPluralRules()` memoises one `Intl.PluralRules` object per locale in a module-level map that
  had no cap and no eviction. The locale it caches under can arrive from `params.locale`, which on
  a server usually traces back to an `Accept-Language` header or a URL segment — request-controlled
  input. A tag `Intl` rejects was cached too, under the rejected tag, so even nonsense values added
  a permanent entry. A long-running SSR process could therefore accumulate unbounded entries from
  traffic alone.

  The cache now evicts the oldest entry once it holds 1000, the same FIFO bound the `Intl` number,
  date and relative-time caches and the template cache already use. Apps stay well under the cap in
  normal use: it takes 1000 distinct locales before anything is evicted, and an evicted locale is
  simply rebuilt on its next use.

- 09029b0: The post-processor chain moved out of the base instance into the plugins capability.

  `postProcess` is a constructor option on every instance, so the base kept the whole chain
  machinery — an array field, a `push`, and an indexed loop — to serve the at most ONE processor a
  bare instance can have. The base now holds a single optional slot applied with one guarded call, and
  `@comvi/core/plugins` owns the array and the loop: `registerPostProcessor()` seeds the chain with
  the constructor option, takes the slot over with its own chaining applier, and appends from there.

  Internal only, no behaviour change. The `postProcess` and `onMissingKey` constructor options stay
  universal; a throwing processor is still swallowed, still reported as `source: "post-processor"`
  with the key and namespace, and still leaves the later processors in a chain running; the
  paramless static-template fast path still post-processes; `destroy()` still drops both. `core-base`
  is 24 bytes (min+gz) smaller.

- 09029b0: The development catalog preflight no longer warns about tag syntax on an instance that has not
  registered a tag extension.

  Adding a catalog with `"Hi <b>{name}</b>"` in it used to print
  `[@comvi/core] Tag syntax in "…" is rendering as literal text: no tag extension claims "<". Render it
with your framework's <T> component …` for every such entry, at `addMessages` time. In an app
  that renders those strings through `<T>` / `prepareTranslation` — which hands the tag grammar to
  core per call and registers nothing on the instance — that advice was telling the user to do exactly
  what they were already doing, once per catalog entry, on every load. Because the warning dedupes
  per template, it also consumed the one warning the render path would have emitted if a `t()` call
  really had rendered the markup literally.

  What still warns, unchanged: a `t()` call that renders tag markup as literal text, once per
  template, naming both fixes; and, in an app that imported `@comvi/core/tags`, a tag the extension
  refuses for carrying attributes. The preflight keeps raising `E_ICU_SYNTAX` at ingestion for an
  argument the instance's compiler cannot compile — that verdict does not depend on how the string is
  rendered. All of this is development-only; production bundles are unaffected.

- 09029b0: A catalog built with `Object.create(null)` is now flattened like any other nested catalog.

  Such a catalog used to be adopted whole on the strength of its missing prototype, so a nested
  one was stored with an object where a string belonged: `t("nav.home")` answered with the key and
  `t("nav")` threw. An already-flat prototype-less catalog is still adopted without a copy.

  Extension syntax inside a plural or select branch is now parsed exactly as it is at the top level.

  Only `{`, `<` and `'` used to send a selected sub-message back through the parser, so a branch of
  plain text kept `&amp;` escaped while the same text one level up rendered `&` — and adding a
  parameter to the branch changed the entity's rendering. The parser's syntax characters are now one
  shared list. A bare `&` is not one of them: it is ordinary copy, so "Terms & Conditions" in a
  branch costs exactly what it did before, while `&amp;` and `&#38;` are decoded.

  ICU exact plural selectors are now matched as numbers, and a non-numeric one is rejected.

  `{n, plural, =1.0 {…} one {…} other {…}}` with `n = 1` used to render the `one` branch, because
  the selector was compared as the string it was written as. `=1.0` and `=01` are now both the
  `n = 1` branch. Where two selectors name the same number — `=1.0` and `=1`, or `=-0` and `=0` —
  the one written last wins, as two identical selectors always did.

  Explicit selectors are now held to ICU's grammar, which is a sign, digits and at most one
  fractional part. This is a behaviour break on values that are not ICU numbers but happened to
  match before, because the old comparison was a plain string match against `String(count)`:
  `=Infinity` with `n = Infinity` matched and now does not. `=Infinity`, `=0x1`, `=1e3`, `=+1`,
  `=.5`, `=1.` and `=abc` all raise `E_ICU_SYNTAX` when the catalog is ingested in development, and
  in production render the argument as written and report once, like every other unsupported ICU
  argument. Write the branch as a plain number, or move the special case into `select`.

  A closing tag written inside ICU-quoted literal text no longer ends the tag around it.

  The closing-tag scanner skipped backslash escapes but not apostrophe quoting, so
  `<b>'{x </b> y}'</b>` rendered `{x y}'</b>` instead of the literal `{x </b> y}` inside the bold
  tag. It now skips quoted sections through the message parser's own helper, in the same
  `#`-is-syntax context the tag was parsed in.

  An apostrophe whose own quote never closes is treated as the literal it looks like, so elision
  before a placeholder keeps working. `<b>l'{name}</b>` in French and `dell'{item}` in Italian are
  ordinary copy, and ICU's rule that an unmatched apostrophe quotes to the end of the message would
  have left the tag unclosed and shown its markup as text. The judgement is made per apostrophe, so
  a balanced quote in the same message still protects a `</b>` inside it.

  Catalog ingestion now enumerates own locale keys only.

  `addMessages` and the `messages` option walked the prototype chain of the outer
  `{ locale: catalog }` map, so a map built on a prototype carrying locale entries had those
  adopted as if they had been passed in.

- 09029b0: `reportError()` no longer silences an error for every other i18n instance in the process.

  The first instance to report an error used to stamp a `Symbol.for("comvi.error.reported")` property
  onto the error object itself, and every instance checked that same stamp before reporting. The mark
  travelled with the object, so a second instance handed the same `Error` stayed silent — its `onError`
  never fired. That is reachable in ordinary code: `init()` reports and then rethrows, so a caller
  that retries on a fresh instance, an app that shares one sentinel error, or an SSR pool where two
  instances touch one rejection all lost the second report. It also mutated an object the application
  owns, which was visible to any code inspecting the error.

  Each instance now keeps its own `WeakSet` of the errors it has reported. The guarantee developers
  actually rely on is unchanged: one instance reports a given error once, however many times it is
  rethrown. A different instance reporting the same error now gets its own callback, as it should.

- 09029b0: `setLocale()` switches synchronously when the target locale's catalogs are already loaded.
- 09029b0: `t()` and `tRaw()` no longer type-check the `"ns:key"` spelling, which the runtime treats as a literal key; write `t("key", { ns })` instead.
- 09029b0: The development warning for a tag that renders as literal text no longer tells you to import a
  module you already imported.

  Tag syntax accepts `<b>` and `<b/>` but not attributes, so `t('see <a href="/x">docs</a>')` leaves
  the `<a>` unclaimed and it renders verbatim. The warning explained that as "no tag extension
  claims `<`" and prescribed `import "@comvi/core/tags"` — advice that could not help an app whose
  whole problem was that the extension was present and had refused the tag.

  When the tag extension is registered and the refused tag carries attributes, the warning now says
  so, and points at the fix that works:

  ```
  [@comvi/core] Tag syntax in "see <a href="/x">docs</a>" is rendering as literal text: attributes are
  not supported in tag syntax; pass them via the `components` config (`{ tag: "a", props: { href } }`).
  ```

  An app with no tag extension registered still gets the original message. Development only, and
  the production bundle is byte-identical.

- 09029b0: `i18n.withMessages()` returns an object with only `t`, `tRaw` and `hasTranslation`, so the read view can no longer reach the i18n instance's write methods at runtime, and the i18n instance has a `localeRevision` count of its locale changes for framework bindings.
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
- 09029b0: The per-request server instance is now destroyed once the request is answered.

  A Nitro request built one instance per locale and parked it in a WeakMap, and the app plugin built one
  more for the SSR render itself; all of them were collectable but never destroyed, so a plugin's
  cleanup — an interval, a socket, a subscription — ran on the client at teardown and never on the
  server. The module now registers a Nitro server plugin that destroys every instance the request made,
  the app plugin's included.
  `afterResponse` is the signal that means both "the handler returned" and "the response is written",
  so a still-running render is never handed a destroyed instance — which matters for
  `defineCachedEventHandler` and `swr` / `isr` routes, where an aborted request still completes and
  writes its render into the cache. A bare h3 app with no Nitro plugin falls back to the response's
  `close` event, deferring on an abort until the response ends or one macrotask passes.

  Two smaller consequences. `useTranslation()` / `loadMessages()` on a request whose instances were
  already destroyed now throws a named error instead of quietly building an instance nothing will ever
  tear down. And a `destroy()` that fails is reported through the instance's `onError` with the new
  `ErrorReportContext` source `"request-cleanup"` rather than thrown into a response that has already
  been sent.

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

- 09029b0: `WrapperI18nHost` is now `WrapperI18nInstance`, `AnyI18nHost` is now `AnyI18nInstance`, `I18nPluginHost` is now `PluginI18nInstance`, `I18nPluginHostApi` is now `I18nPluginApi`, and `hasPluginHostApi` is now `hasPluginApi`.
- 09029b0: `@comvi/core/rich-text` now re-exports `registerTagSyntax` alongside `prepareTranslation`. It is
  the identical function `@comvi/core/tags` calls at import time to register `<tag>` syntax
  ambiently for the plain string-API `t()`; `rich-text` still registers nothing on import, since
  exporting the function is not calling it. This gives a caller who only has the pure `rich-text`
  entry in hand an explicit, discoverable opt-in into ambient registration without needing to know
  that the `@comvi/core/tags` subpath exists.

## 0.4.1

### Patch Changes

- 67780e8: Support underscores in interpolation tag names, including paired and self-closing `snake_case` tags in ICU message branches.

## 0.4.0

### Minor Changes

- bec9ad6: Bundle-size pass for @comvi/core (−17% min, −7% gzip for consumers; more when formatters are unused).

  **BREAKING (@comvi/core):** `formatNumber` / `formatDate` / `formatCurrency` / `formatRelativeTime` and the `dir` getter moved off the `I18n` class to standalone tree-shakeable exports. Migrate `i18n.formatNumber(v, opts)` → `formatNumber(i18n, v, opts)` and `i18n.dir` → `getTextDirection(i18n.locale)`. Framework bindings (`useI18n`, `useFormatters`) keep their existing API — no changes needed in components.

  Other changes:
  - Internal class members now use native `#private`, so app bundlers mangle them (CDN UMD 25.5 → 21.2 kB).
  - `TranslationCache.getInternalMap()` returns the snapshot typed as `ReadonlyMap` without a runtime wrapper.
  - New `development` export condition ships readable error messages in dev; the production artifact keeps compact `E_*` codes.

- 38ce169: ICU apostrophe handling switched to DOUBLE_OPTIONAL mode (same as ICU4J, FormatJS, i18next and Tolgee):
  - A bare `'` starts quoted literal text only when it immediately precedes a syntax character. Everywhere else it is literal, so real-world content like `Superiors' behavior`, a trailing `l'` or `Gib' eine Bewertung` inside a select branch no longer breaks parsing or loses characters.
  - `{` and `}` are syntax characters everywhere; `#` counts as one only inside plural/selectordinal sub-messages (including select sub-messages nested in them), exactly like ICU4J. At the top level and in standalone selects `'#'` stays two literal characters.
  - `''` still collapses to a literal apostrophe, and `'{...}'` still escapes ICU syntax.
  - Plural/select branches that contain apostrophes but no `{`/`<` are now routed through the parser too, so `''` inside a flat branch renders as `'` instead of leaking the doubled apostrophe.
  - Fixed a template-cache bug where a message whose parsed output differs from its source (quoting, `&lt;`, `\<`) was flagged static after the first render and returned raw (with quoting artifacts) on every subsequent `t()` call.
  - Context-sensitive template and plural-choice caches now namespace both parser modes, preventing control-character-prefixed source text from colliding with internal cache markers.

  Behavior change: previously `o' clock` rendered as `o clock` (the bare apostrophe opened a quoted section). It now renders as `o' clock`. Messages relying on single-quote hiding of arbitrary text must either double the apostrophes or quote ICU syntax characters directly.

- aaea018: Instance-level `defaultParams`:
  - `createI18n({ defaultParams: { formality: "formal" } })` merges the given params under every `t()`/`tRaw()` call; call-level params override defaults key by key (shallow merge).
  - `defaultParams` contains non-nullish interpolation values only. Per-call controls (`locale`, `ns`, `fallback`, `raw`) and `null`/`undefined` values are rejected in types and at runtime.
  - `setDefaultParams(...)` replaces the defaults at runtime and emits `configChanged` (source: `"defaultParams"`), so framework bindings re-render automatically. Defaults guaranteed by the constructor cannot later be removed or changed outside the generated message schema; instances created without defaults may still set or clear dynamic defaults. Explicitly optional default properties are rejected because they cannot represent constructor guarantees.
  - Params objects are copied shallowly on write and read: top-level additions/reassignments do not mutate instance state, while nested arrays, VNodes, callbacks, and props retain identity and should be treated as immutable.
  - Typed core/Vue instances make constructor-guaranteed, type-compatible message params optional at call sites. Framework hooks remain conservative by default and accept an explicit defaults type when the provider scope guarantees it.
  - An ICU `select` whose param is missing still falls back to its `other` branch, which keeps missing-default setups rendering the informal/default text instead of breaking.

  All framework facades expose the same `defaultParams` / `setDefaultParams` names with idiomatic reactivity: Vue/Nuxt `ComputedRef`, React render snapshot, Solid accessor, and Svelte readable store. Typed translation calls carry the explicit defaults type in every binding, including Svelte stores. `createNextI18n()` and Nuxt client/request instances now forward constructor defaults.

### Patch Changes

- a5c80b8: State and input hardening:
  - `addTranslations` / the `translation` option no longer mutate the caller's object (`Object.setPrototypeOf` removed); flat catalogs are shallow-copied.
  - Non-string catalog leaves no longer crash `t()`: arrays/numbers are coerced with `String()` (dev warning), `null`/`undefined` leaves are dropped.
  - `isInitializing` stays `true` for the whole `init()`, even when a locale detector triggers a locale change mid-init.
  - Reverting to the current locale while another locale change is in flight now cancels that change (last request wins).
  - `clearTranslations()` / `reloadTranslations()` cancel matching in-flight namespace loads, so stale responses can't repopulate a cleared cache and reload always fetches fresh data.
  - Per-call `fallback` now skips the instance-level `onMissingKey` option (registered callbacks still fire).

- 6463199: Fix `#` binding in nested plurals.

  When a plural was nested inside another plural's option, the inner `#` octothorpe
  was substituted with the **outer** plural's count instead of its own. For example
  `{files, plural, other {# files in {folders, plural, other {# folders}}}}` with
  `{ files: 3, folders: 5 }` rendered `3 files in 3 folders` instead of `3 files in 5 folders`.

  The cause was a greedy `#` replacement that ran across the whole selected branch
  (including nested `{...}` blocks) before recursing into them. Replacement is now
  scoped to the current plural level: `#` inside nested blocks and quoted literals is
  left untouched, so each plural binds `#` to its nearest enclosing count, per the ICU
  MessageFormat spec.

## 0.3.0

### Minor Changes

- 1feaed4: Add a minified UMD/CDN build and improve runtime performance.
  - New `dist/comvi-core.global.prod.js` (~7.9 kB gzip) for `<script>` / unpkg / jsDelivr consumers, exposed via the `unpkg` and `jsdelivr` package fields. The main npm ESM/CJS entries remain unminified by design (consumers' bundlers re-minify); only this dedicated CDN artifact is minified.
  - Sourcemaps are no longer shipped in the published tarball (smaller install size).
  - `formatRelativeTime()` now caches its `Intl.RelativeTimeFormat` instances, matching the existing number/date format caches.
  - `dir` is memoized on the active locale, avoiding a per-access `Intl.Locale` construction and regex evaluation.
  - Fixed a cross-instance cache bug: clearing translations or destroying one `I18n` instance no longer wipes the shared compiled-template cache for other live instances (template parsing is locale-independent, so the cache stays valid). The template cache is now bounded with insertion-order eviction to prevent unbounded growth. No public API or behaviour change.

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- 88ae52a: Add optional `locale` parameter to `formatNumber()`, `formatDate()`, `formatCurrency()`, and `formatRelativeTime()` to override the instance locale on a per-call basis. Existing call sites without the argument continue to work — the helpers fall back to the instance locale. The optional argument enables framework bindings (e.g. `@comvi/react` `useFormatters()`) to thread the React-tracked locale through formatters so output stays in sync with concurrent rendering.

  The `I18n` interface in `@comvi/core/types` is updated to match the concrete class signature. Internal Intl format caches now key on `(locale, options)` so different override locales do not serve stale `Intl.NumberFormat` / `Intl.DateTimeFormat` instances.

- 4050429: CORE reactivity fixes from the v0.3 review:
  - **core (L3):** `addTranslations()` no longer emits `configChanged` for runtime-added translations — it relies on the `namespaceLoaded` event (and the cache-revision bump) that `_nsAddTranslations` already fires, removing a redundant double re-render. **Behavior note:** if you have an external `on("configChanged", …)` listener that was reacting to `addTranslations`, switch it to `on("namespaceLoaded", …)`. `configChanged` is still emitted for fallback-locale and namespace-activation changes. An empty `addTranslations({})` is now a true no-op.
  - **core (L1):** the `Intl` formatter caches (number/date/relative-time) are now bounded (FIFO eviction at 1000 entries), mirroring the template cache. Prevents unbounded growth for apps formatting many distinct `(locale, options)` combinations via the per-call `locale` override.
  - **solid & svelte (M4):** the cache-revision signal/store now uses a single monotonic counter instead of summing two independent counters, which could collide non-monotonically and drop a re-render (e.g. a `configChanged` that didn't change the translation cache).
  - **vue (M1):** added imperative, non-reactive `hasTranslationNow(key, opts?)` and `hasLocaleNow(locale, namespace?)` returning plain booleans — for use in loops/handlers where the reactive `hasTranslation()`/`hasLocale()` (which allocate a `computed()` per call) would leak outside an effect scope. Re-exposed through `@comvi/nuxt`'s `useI18n()`.

- 872680e: Close the React `useStoreRevision` re-render race for non-cache events (M3).

  A `configChanged` (fallback-locale / namespace-activation) or `defaultNamespaceChanged` that fired in the narrow window between a `useI18n` consumer's commit and its `useSyncExternalStore` subscribe-effect attaching could be dropped — the snapshot's per-component event counter started at 0 and only counted post-subscribe events, and these events don't bump the translation-cache revision.

  The fix makes the React store snapshot **content-addressed**: it derives purely from observable instance state (`translationCache.getRevision()` + `isInitialized` + default namespace + active namespaces + fallback locales) instead of a subscription-timing-dependent counter, so state mutated before the subscriber attached is detected on the post-subscribe re-read. As a bonus, a bare `configChanged`/`defaultNamespaceChanged` emit that does NOT change state no longer forces a spurious re-render.

  `@comvi/core` adds a small read-only `getFallbackLocales()` accessor used by the snapshot.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.
