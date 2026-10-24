# @comvi/plugin-fetch-loader

## 0.7.0

## 0.6.0

## 0.5.0

### Minor Changes

- 09029b0: **BREAKING (breaking change on a 0.x minor): the API host option is `baseUrl`, and only `baseUrl`.** `apiBaseUrl` is removed from `FetchLoaderOptions`, so passing it is a type error. Precedence: `baseUrl` > build-time env overrides (`VITE_API_BASE_URL` / `NEXT_PUBLIC_COMVI_API_URL`) > the new `comviPreset` export, which carries the vendor defaults (`https://api.comvi.io` / `https://cdn.comvi.io`). Internally, the 948-line `src/index.ts` is split into `options` / `http` / `cache` / `loader` modules with an unchanged public surface.
- 09029b0: **BREAKING (breaking change on a 0.x minor): the raw plugin factories are renamed to `fetchLoaderPlugin` and `cdnLoaderPlugin`.** They used to differ from their installers by letter case alone — `fetchLoader` composed the capabilities and registered the plugin, `FetchLoader` built a plugin and composed nothing — so one mistyped capital silently changed what a chain did, and the failure surfaced as `E_USE_NOT_INSTALLER` or a missing-capability error rather than as a typo. The `Plugin` suffix says which name is which.

  ```diff
  -import { FetchLoader } from "@comvi/plugin-fetch-loader";
  -import { CdnLoader } from "@comvi/plugin-fetch-loader";
  +import { fetchLoaderPlugin } from "@comvi/plugin-fetch-loader/api";
  +import { cdnLoaderPlugin } from "@comvi/plugin-fetch-loader";

  -i18n.registerPlugin(CdnLoader({ cdnUrl }));
  +i18n.registerPlugin(cdnLoaderPlugin({ cdnUrl }));
  ```

  `fetchLoader` and `cdnLoader` — the installers you pass to `.use(…)` — keep their names, and so does every option type (`FetchLoaderOptions`, `CdnLoaderOptions`), every installer type and `I18nPluginFactory`. Behaviour is unchanged on both names. The old names are removed, with no deprecated aliases.

- 09029b0: `cdnLoader` is the package root; `fetchLoader` and the HTTP helpers moved from the root to
  `@comvi/plugin-fetch-loader/api`.

  ```ts
  import { createI18n } from "@comvi/core";
  import { cdnLoader } from "@comvi/plugin-fetch-loader";

  const i18n = createI18n({ locale: "en" }).use(
    cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }),
  );
  ```

  `cdnLoader(options)` and `cdnLoaderPlugin(options)` are the CDN half of the fetch loader on its
  own. `fetchLoader()` decides between the CDN and the Comvi API at runtime, from the i18n
  instance's `apiKey`, so it carries the whole API request path: the project-info cache, the legacy
  export chain and the retry policy. The package root does not contain that path, so the CDN path
  stays the lighter entry.

  Everything the CDN mode does, `cdnLoader` does: one request per `locale:namespace` with concurrent
  callers deduplicated, a timeout that covers the response body, the `fallback` import map,
  `cdnLayout`, SSR `cache` options, and the abort when the i18n instance clears a scope that is still
  loading.

  `CdnLoaderOptions` is the CDN subset of `FetchLoaderOptions`: `baseUrl` and `retry` only
  describe the API request path, so naming one here is a compile error rather than a setting
  that quietly does nothing.

  Import `fetchLoader()` and `fetchLoaderPlugin()` (0.4's `FetchLoader()`) from
  `@comvi/plugin-fetch-loader/api` wherever the i18n instance carries an `apiKey`. Both entries run
  one shared CDN request path, so the two cannot drift.

- 09029b0: Loads land through `addMessages()`, and the late-compose diagnostic now recommends `reloadMessages()`, matching the renamed `@comvi/core` catalog methods.
- 09029b0: **`CDN_BASE_URL` is not exported.** Nothing in the package read it: `cdnUrl` is a required option with no default and no environment override, so the constant and its `VITE_CDN_BASE_URL` / `NEXT_PUBLIC_COMVI_CDN_URL` reads answered a question the loader never asks. `API_BASE_URL` stays, since the API path really does fall back to it, and the hosted CDN default is readable as `comviPreset.cdnBaseUrl`.
- 09029b0: **The project-info request is retried, within bounds.** A 429, a 5xx or a
  transport failure on `/v1/project` now gets up to two more attempts instead of
  failing the whole load on one bad moment.

  Only that request is retried. The CDN namespace load and the API translations
  request are not: core's fallback-locale loop already sits behind them, and
  retrying there would multiply what a `setLocale` costs on a flapping CDN.

  The policy is deliberately narrow:
  - a **timeout is never retried**, so a stalled server still fails as fast as
    `timeout` says and core's fallback-locale path runs on schedule;
  - a **404 is never retried** — on the API path that is how the legacy export URL
    gets selected, not a failure;
  - an **abort during the wait** ends it immediately, with no further request;
  - `Retry-After`, in seconds, is honoured, and the **waits between attempts never
    add more than five seconds**; each attempt still runs under its own `timeout`.
    A server asking for a longer wait than the budget has left is taken at its
    word and not retried at all;
  - everyone joining one in-flight project-info lookup shares one sequence of
    attempts, exactly as they already shared one request.

  Pass `retry: false` to the installer to switch it off:

  ```ts
  i18n.use(fetchLoader({ cdnUrl, retry: false }));
  ```

- 09029b0: **Added: `fetchLoader(options)` — the bare-name `.use(…)` installer.** `@comvi/core` is the
  base instance now, so async loading and the plugins capability are imports you add; the installer does
  both in one call and then registers the plugin you already know.

  ```ts
  import { createI18n } from "@comvi/core";
  import { fetchLoader } from "@comvi/plugin-fetch-loader/api";

  const i18n = createI18n({ locale: "en" }).use(fetchLoader({ cdnUrl }));
  await i18n.init();
  ```

  That replaces `createI18n({ … }).use(attachLoader).use(attachPlugins)` followed by
  `i18n.registerPlugin(fetchLoaderPlugin({ … }))`.

  `fetchLoaderPlugin` behaves exactly as `FetchLoader` did (the rename is in its own
  changeset), and the installer re-implements no lifecycle: `required`,
  `timeout`, `onError`, cleanup registration and LIFO destroy keep running inside the plugins capability,
  because the installer's last act is `registerPlugin`. It composes `@comvi/core/loader` and
  `@comvi/core/plugins` idempotently, so an instance that already has either keeps everything registered
  on it. One timing difference is deliberate: `fetchLoader` builds the plugin while it composes, so
  a missing `cdnUrl` throws at COMPOSITION rather than at `init()`. The exported installer type is
  `FetchLoaderInstaller`.

  Putting one in the other's slot is rejected: both cross-uses are type errors, and at runtime
  `registerPlugin(fetchLoader(…))` fails at `init()` with `E_INSTALLER_AS_PLUGIN`, on the
  installer's first ensure-step, naming `fetchLoader` and the `.use` form, while
  `.use(fetchLoaderPlugin(…))` runs the plugin against an instance that has neither capability — and on
  one that has both it throws `E_USE_NOT_INSTALLER`, because an installer widens the instance in
  place and hands that same instance back, and a plugin never does.

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
- 09029b0: **A request whose whole scope `clearMessages()` drops is now aborted.**
  Clearing stops the instance from waiting on the matching loads, but their HTTP
  requests kept running to completion — holding a connection open for an answer
  nobody would read. The editor-save and webhook-refresh flow (clear, then
  reload) paid for every namespace twice.

  A request is abandoned only when the clear covers all of it:
  - `clearMessages("en", "common")` aborts the request loading exactly that
    namespace, and leaves requests for other locales and other namespaces alone.
  - `clearMessages()` and `clearMessages("en")` abort everything in
    flight for that scope.
  - In API mode one request carries every active namespace. Clearing one of them
    leaves that request running, because the instance is still waiting for the rest.

  Nothing new is reported: an abandoned request raises neither `onLoadError` nor
  the instance's `loadError`, because the instance had already stopped waiting for every
  namespace it carried.

  **What this does not cover:** a locale switch superseded by another switch. The
  instance keeps such a load, lets it finish and caches its result, and announces
  nothing the loader could follow — so that request still runs to completion.

- 09029b0: A CDN catalog whose JSON root is not an object is now a reported load failure.

  The CDN path accepted any JSON root and handed it to `addMessages`, so a string became
  per-character keys, an array numeric ones and `null` an empty catalog — a silently wrong catalog
  instead of an error. It now runs the same shape check as the API path, which both paths share, and
  the failure reaches `onLoadError` like any other.

- 09029b0: Errors thrown by this package are prefixed with the package name rather than
  `[FetchLoader]`.

  `[FetchLoader]` named an export, not the package, so a
  `@comvi/plugin-fetch-loader` user reading `[FetchLoader] Request aborted: …`
  saw a symbol they never imported. Every message now begins
  `[@comvi/plugin-fetch-loader]`, whichever entry point raised it:

  ```diff
  -[FetchLoader] Invalid locale: "../etc"
  +[@comvi/plugin-fetch-loader] Invalid locale: "../etc"
  ```

  Only the prefix changes; the rest of every message, the error `name`
  (`AbortError` is still `AbortError`) and every thrown type are the same. Code
  matching on message text needs updating; code matching on `error.name` does not.

- 09029b0: `.use(fetchLoader(…))` and `.use(cdnLoader(…))` composed after `init()` now warn with the plugin-queue message, which is the one whose recovery advice works. Before, the loader capability attached first and claimed the once-per-instance warning with advice that could not work on that instance (`reloadMessages()` throws `E_NO_LOADER_REGISTERED`, `addActiveNamespace()` fetches nothing). The `loadOnInit` JSDoc now says what the flag does on the public entry points: it does not suppress or add the `init()` request; use `ns: []` to start without one.
- 09029b0: **The legacy export URL now validates its locale and namespaces like every
  other URL the loader builds.** It was the one builder that skipped the check,
  so a locale or namespace carrying path segments would have been interpolated
  into the request path unexamined. Nothing reaches it with bad input today — the
  only route to it validates first — and now nothing can.
- 09029b0: The API base URL no longer reads `import.meta.env.VITE_API_BASE_URL`, which the published build could never see; pass `baseUrl`, or set `NEXT_PUBLIC_COMVI_API_URL`, which is read from `process.env` on the server (the name follows Next's convention, and only Next can inline it into a browser bundle).
- 09029b0: **A malformed API payload is now refused instead of silently becoming junk
  translations.** Two levels of the export response went unchecked.

  If a namespace's locale map arrived as a string, `Object.entries("ab")` turned
  it into entries `0` and `1`, so the loader cached `0:default` and `1:default`
  and the real keys were simply missing. The same held for a catalog that came
  back as a string, a number or `null`. Both now throw the existing invalid
  response error, naming the exact path:

  ```
  [@comvi/plugin-fetch-loader] Invalid API response: "namespaces.default.en" must be an object
  ```

  The project lookup is checked too. Its `id` is interpolated into the export URL
  path, so a 200 that is not a project — no `id`, a `null` one, an object, or a
  string carrying path segments such as `../..` — is refused rather than turned
  into a malformed request:

  ```
  [@comvi/plugin-fetch-loader] Invalid API response from https://api.comvi.io/v1/project: "id" must be a number or a path-safe string
  ```

  That refusal is not retried: asking the same endpoint again cannot change what
  it answered.

- 09029b0: **The request timeout now covers reading the response body.** The timer used to
  be cleared as soon as the response headers arrived, so a server that answered
  and then stalled mid-body held the load open indefinitely: `setLocale`
  never settled, no fallback locale was tried, and `onLoadError` never fired.

  All four request shapes are bounded now — the CDN namespace fetch, the API
  translations request, the project-info lookup, and the export request the 404
  fallback reaches for — each under its own full timeout, failing with the same
  `Request timeout after Nms` error a stalled connection produces.

  If you supply your own transport through `fetchFn`, a non-OK response is now
  also read for its `Retry-After` header. A response object without `headers` is
  handled, so a hand-written transport that answers with a bare
  `{ ok, status, statusText }` keeps working.

- 09029b0: The `cdnLoader` and `cdnLoaderPlugin` documentation now points to `fetchLoader` in `@comvi/plugin-fetch-loader/api` and imports `attachLoader` in its example.
- 09029b0: A load that follows `reloadMessages()` or `clearMessages()` now starts a new request instead of joining the abandoned one, so it no longer returns the stale catalog or the old request's `AbortError`.
- 09029b0: The `fetchLoaderPlugin` documentation example now composes the loader and plugin capabilities before calling `registerPlugin`.
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

## 0.4.1

## 0.4.0

### Minor Changes

- 01b40e9: Add explicit CDN namespace layout control:
  - Existing setups remain unchanged: when `cdnLayout` is omitted, the consumer's `defaultNs` is fetched from the CDN root (`{cdnUrl}/{lang}.json`).
  - Set `cdnLayout.rootNamespace` when the namespace stored at the CDN root differs from the consumer's `defaultNs`.
  - Set `cdnLayout.rootNamespace: false` when every namespace lives in its own folder (`{cdnUrl}/{ns}/{lang}.json`).
  - `buildCdnUrl` accepts the layout as an optional fifth argument, and locale/namespace validation now rejects dot-only path segments.

### Patch Changes

- 60ee056: Harden fetch-loader request lifecycle and response diagnostics:
  - plugin cleanup aborts in-flight API and CDN requests without running fallbacks or load callbacks; locale changes do not cancel explicit preload requests
  - SSR cache options now propagate through the API translations, project-info, export, and legacy-export paths
  - malformed JSON errors identify the exact response URL, including legacy fallbacks
  - successful API responses must contain a valid `namespaces` object instead of silently becoming an empty translation store
  - `fetchApiTranslations` and `fetchProjectInfo` accept additive request options after the existing custom transport and cache-scope arguments

- 8c4ed91: Pin the `@comvi/core` peer range to the minor line each release ships with (`^0.3.0` for 0.3.x, auto-synced to `^0.4.0` at the next release by `scripts/sync-peer-ranges.mjs`). Prevents the out-of-range escalation that turned the whole fixed group into a major bump at version time.

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

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
