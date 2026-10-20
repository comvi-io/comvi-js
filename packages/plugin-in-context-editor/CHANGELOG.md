# @comvi/plugin-in-context-editor

## 0.6.0

### Patch Changes

- 1fb2046: The in-context editor counts its stylesheet as adopted wherever it sits among the shadow root's adopted sheets, and takes a half-finished adoption back before it falls back to a `<style>` element, so its styles are never applied twice.
- 1fb2046: In the in-context editor, translation text no longer jumps to the right when you start editing a field, and the source language is now listed first with a neutral `Source` marker instead of an orange tint.
- 1fb2046: The in-context editor now applies its styles through a constructable stylesheet instead of an inline `<style>` element, so it renders on sites whose Content Security Policy has a strict `style-src`; the standalone build also exposes its own `version` and reports the `devtools()` editor loader it found in `getStatus().hook`.
- 1fb2046: The "Languages" picker in the in-context editor now shows all of its languages instead of letting the first translation field draw over them.

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

- 09029b0: **BREAKING (breaking change on a 0.x minor): the raw plugin factory is renamed `InContextEditorPlugin` → `inContextEditorPlugin`.** This package already spelled the suffix; what it did not do is match the casing of its three siblings, so the four first-party factories now read the same way — `inContextEditorPlugin` beside the `inContextEditor` installer, as `fetchLoaderPlugin` sits beside `fetchLoader`.

  ```diff
  -import { InContextEditorPlugin } from "@comvi/plugin-in-context-editor";
  +import { inContextEditorPlugin } from "@comvi/plugin-in-context-editor";

  -i18n.registerPlugin(InContextEditorPlugin({ debug: true }));
  +i18n.registerPlugin(inContextEditorPlugin({ debug: true }));
  ```

  Both export conditions are renamed — the default entry and the `production` no-op — and so is the property on the standalone bundle's global: `window.ComviInContextEditor.inContextEditorPlugin`. The `inContextEditor` installer, `EditorOptions`, `InContextEditorInstaller` and every other export keep their names, and behaviour is unchanged. The old names are removed, with no deprecated aliases.

- 09029b0: The standalone runtime speaks discovery protocol v2. On boot, and again on `activate()`, it
  drain-and-swaps `window.__COMVI__`: it snapshots the queue array, swaps in a dual-protocol
  hook object first, then drains the snapshot. The hook implements both protocols — v2
  `push` / `remove` for new core, and the v1 surface (`register` / `unregister` / `get` /
  `instances`) so an OLD `@comvi/core` landing on a page where the new editor already swapped
  still attaches. A pre-existing v1 registry object is drained via its `instances` map, and a
  truthy non-conforming global is left untouched. `getStatus()` reports version and instance
  counts from whichever shape currently occupies the global.
- 09029b0: The standalone activation option that refetches catalogs from the Comvi API before click-to-edit is now `refreshMessages`. The old `refreshTranslations` name is removed.
- 09029b0: **Added: `inContextEditor(options)` — the bare-name `.use(…)` installer, under both export
  conditions.** `@comvi/core` is the base instance now, so extension discovery and the plugins capability
  are imports you add; the installer composes both and registers the editor plugin in one
  call.

  ```ts
  import { createI18n } from "@comvi/core";
  import { inContextEditor } from "@comvi/plugin-in-context-editor";

  const i18n = createI18n({ locale: "en", apiKey }).use(inContextEditor());
  await i18n.init();
  ```

  Discovery is composed too, on purpose: the editor's whole point is being driven from outside
  the page, so an editor-enabled instance announces itself on the `window.__COMVI__` queue without
  a separate `.use(devtools())`. Both attaches are idempotent.

  **The instance type comes back unchanged, and that is the contract.** `inContextEditor` widens
  nothing — the editor needs no public surface from its caller, and this is the only widening
  that stays true under the package's `production` export condition, where the installer is
  literally `(instance) => instance`. The type is IDENTICAL under both conditions, so a
  `.use(inContextEditor())` chain type-checks and behaves the same whichever entry your
  bundler picked. If you want `registerPlugin` yourself, compose `.use(plugins())`.

  `inContextEditorPlugin` behaves exactly as `InContextEditorPlugin` did (the rename is
  in its own changeset), and the installer re-implements no lifecycle: `required`,
  `timeout`, `onError`, cleanup registration and LIFO destroy keep running inside the plugins capability,
  because the installer's last act is `registerPlugin`. Putting one in the other's slot is a type
  error and loud at runtime — and under `production` `registerPlugin(inContextEditor(…))` is caught
  by the plugin-return rule instead, because the identity no-op hands the instance back and a plugin
  may only hand back nothing or a cleanup function.

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

- 09029b0: New `@comvi/core/editor-bridge` subpath: the typed contract for the in-context editor
  mappings bridge, previously hand-copied in two places. It exports `EDITOR_MAPPINGS_GLOBAL` /
  `EDITOR_INITIAL_MAPPINGS_GLOBAL` (the property keys on the instance), the `InContextEditorMappings`
  interface, the `toRecordOfNumbers()` payload validator and the `readEditorMappings(instance)`
  guard. The module is pure and invisible to non-importers.

  `@comvi/plugin-in-context-editor` and `@comvi/nuxt` now consume this shared contract instead
  of their local copies. No behaviour change — SSR key-mapping transfer between the editor
  plugin and the Nuxt runtime works exactly as before — but the property keys and bridge shape
  can no longer drift apart.

- 09029b0: Context collection sends nothing on `pagehide` after the editor stops, or after a collection pass fails and turns collection off. Its `pagehide` listener is removed even when teardown itself fails, and stopping twice sends the final pass only once.
- 09029b0: The in-context editor keeps up with a page that rearranges itself.
  - An element the page moves or reorders stays editable.
  - Every translation in one text node or attribute is tracked. For `<p>{{ t('hello') }} {{ t('bye') }}</p>`, Alt-click offers both keys in the key selector, each with its own preview, and context collection reports both. `NodeData.markers` lists them. A marker split across adjacent text nodes decodes on the node where it starts, and it is dropped when either part changes or goes away. A broken marker fragment, in text or in an attribute, decodes to nothing rather than to a wrong key.
  - A web component that attaches its shadow root inside another component's shadow tree after startup is observed, and its translations are editable.
  - A DOM insertion scans only the inserted subtree. The editor ignores its own highlight overlay and tooltip, and a rescan that finds unchanged data republishes nothing.
  - Alt-click resolves against the element's current parent, after the page moves it between containers.
  - While shown, the highlight follows its element on every animation frame, through scrolling, window resizes and layout shifts such as content inserted above it.

- 09029b0: The package no longer ships two stylesheets that nothing loaded; the editor textarea looks the same, because its placeholder and selection colours already come from utility classes inside the editor's shadow root.
- 09029b0: The standalone activation reads the Comvi API through `@comvi/plugin-fetch-loader/api`.
- 09029b0: `window.__COMVI__` adoption is validated before it is trusted, and colliding instance ids no
  longer lose an instance.

  `ensureComviHook()` adopts an existing global as an already-installed hook only when it
  carries every member this package then uses on it (`push`, `remove`, `get` and an `instances`
  Map) alongside the `__comviEditorHook` marker, and it probes `Array.isArray` before the
  marker. The marker alone is page-writable data: an object carrying only the marker made the
  editor read members that do not exist, and a page that pollutes
  `Object.prototype.__comviEditorHook` did the same to a legitimate queue array. Such a global
  is now treated as whatever it otherwise looks like, a v1 registry when it duck-types as one
  and an untouched foreign value otherwise, so `activate()` reports no instance instead of
  throwing. The queue envelope's `i` is read as an own property, so a polluted
  `Object.prototype.i` can no longer get a page-chosen object tracked as the i18n instance.

  Two instances announcing the same id are both kept: the later one is tracked under
  `<id>#<n>`, with a console warning naming both keys. `get(id)` still resolves such an
  instance by the id it announced while that is unambiguous, falling back to the single
  suffixed entry when nothing holds the exact key. `remove()` drops a slot only while it still
  holds that instance, and `unregister(id)` resolves the instance that claimed the id through
  `register(id, instance)` before falling back to the current holder, so neither can evict a
  different live instance.

- 09029b0: `createI18n({ collectContext: false })` is honoured on the composed plugin path.

  The option on the i18n instance is the single developer-level opt-out: the plugin option can
  narrow collection, never re-enable it. `standalone.ts` (the extension path) already applied that
  rule, but `inContextEditorPlugin()` read only its own option, so an app that opted out in
  `createI18n` still had the context collector started as soon as the editor plugin was installed.

  The composed path resolves the same way as standalone: `false` on the instance wins, otherwise the
  plugin option decides, and leaving both unset keeps the default (collection on). On the extension
  path the page reports the flag during activation, so a hostile page can report `true`; the
  extension README describes that boundary.

- 09029b0: Each server-side instance now keeps its own key-id map, the mappings bridge stays until the last editor runtime on an instance is torn down, and stopping one editor instance no longer closes UI another active instance opened.
- 09029b0: `parseICUSelect` no longer drops the last character of a select arm whose closing brace is missing (`"{gender, select, male {He}"` now yields `{ male: "He" }`, not `{ male: "H" }`).
- 09029b0: The in-context editor's placeholder check no longer invents a `{name` variable for `{{name}}`.

  `validateTranslations()` compares the placeholders of each plural form against the first form and
  warns when they differ. It extracted `{{name}}` with two patterns at once: the double-brace one
  gave `name`, and the single-brace one — whose name class allowed an opening brace — also matched
  the inner `{name}` of the doubled pair and gave `{name`. Every double-brace placeholder therefore
  counted twice, once under a name that does not exist.

  Two visible consequences, both fixed:
  - A translation written `{{name}}` in one form and `{name}` in another was reported as a
    mismatch: `Placeholders differ from the first form; missing: {name`. Those are the same
    variable, and no warning is raised now.
  - A genuine mismatch between two double-brace forms listed each variable twice, as
    `missing: name, {name; unexpected: nom, {nom`. It now names `name` and `nom` once each.

  The single-brace pattern excludes braces from the variable name, which makes it match the inner
  `{name}` of `{{name}}` on its own, so the separate double-brace pattern is gone. Text that is not
  a placeholder at all yields different junk names than before — `{a{b}c}` gives `b` rather than
  `a{b`, and an ICU plural string gives its branch bodies rather than one run-on name — which
  changes nothing that matters, because the warning only compares one plural form's names against
  another's.

- 09029b0: Packaging and production hardening. Every bundled dependency moved from `dependencies` to
  `devDependencies`, so `@comvi/plugin-in-context-editor` now declares no runtime dependencies
  at all and installing it pulls nothing into your tree. The UI libraries are compiled into
  `dist/index.es.js`; `@comvi/plugin-fetch-loader` went the same way, because the only module
  that names it is the standalone IIFE, which inlines it — no published entry could load it as
  a runtime dependency.

  The full entry's plugin factory now also returns a no-op plugin at runtime when
  `NODE_ENV=production`, as a belt-and-braces guard for bundlers that ignore the `"production"`
  export condition (which already resolves to the lightweight stub). No API changes.

- 09029b0: Saving in the edit modal keeps every translation intact:
  - A save that finishes after you open another key updates only the key, namespace and app instance it was made for. It does not replace or close the modal you are now in. Escape and Discard wait while a save is pending, and Ctrl/Cmd+S shows the same "Saving..." state as the buttons.
  - A message the plural and variant fields cannot rebuild exactly is edited as written in one field. This covers exact selectors such as `=0`, `offset:`, other nestings, multiline layout and text around the plural. Languages you did not edit are sent back exactly as stored. A plural key whose languages are all edited as written saves without asking for a plural variable.
  - Adding variants to a plural message keeps its plural forms under every variant, and switching plural or variants off keeps the remaining values. These conversions no longer leave empty branches in the saved message.
  - Ctrl/Cmd+S saves from the first time the edit modal opens.

- 09029b0: Fixes in the key selector, the standalone runtime and the manual lifecycle:
  - The key selector, shown when one element carries several keys, opens next to the element on a
    scrolled page instead of off-screen.
  - Key selector previews load through the API configuration of the editor that opened the selector,
    so they show the translation instead of "(Error loading)" or another project's value.
  - Closing the key selector right after it opens leaves no document listeners behind.
  - Standalone `activate()` returns `null` with a console error for an i18n instance created without
    the plugin capability, such as `createI18n().use(devtools())`, instead of throwing. Without an
    `instanceId` it picks an instance it can edit over one it cannot.
  - Standalone `activate({ refreshMessages: false })` marks text the app rendered before activation;
    only the API refresh is skipped.
  - Standalone `activate()` applies `highlightStyle`.
  - Calling `init()` again stops the runtime the previous `init()` started, and `stop()` stops the
    current one.
  - The `collectContext` documentation describes when collection runs and what it sends: the page
    origin, the keys on screen with their screen group, and structural and layout signals, never
    rendered text.

- 09029b0: `./standalone` now ships types; exports conditions reordered, no runtime change.
  - **`./standalone` had no `types` condition.** The subpath mapped straight at
    `./dist/standalone.iife.js`, so `import { activate } from "@comvi/plugin-in-context-editor/standalone"`
    resolved to `any`. It now points at the `dist/standalone.d.ts` the build already emitted,
    which declares `activate`, `deactivate`, `isActive`, `getStatus` and the
    `window.ComviInContextEditor` global.
  - **`types` now comes first in the `.` condition map**, matching `@comvi/core`. The
    per-condition declarations are kept by nesting them under it, so a `production` consumer still
    types against the no-op entry and everyone else against the full one. The runtime conditions
    are unchanged: `production` still resolves to `dist/production.es.js` and everything else to
    `dist/index.es.js`.

- 09029b0: The in-context editor's form looks and behaves like a form again.
  - Unchecked checkboxes show their box, and every translation field has a border and a focus ring, in the light and the dark theme. The editor renders in a shadow root, where Tailwind's `@property` defaults do not apply, so every border utility drew nothing; the editor's stylesheet now declares those defaults itself.
  - While a save is pending, the form stays on screen with its fields and controls disabled, instead of being replaced by the loading skeleton.
  - A new save clears the toasts of earlier ones, so a failed save shows its error without the previous save's "Saved" toast beside it.
  - A disabled primary button, such as Save & Close before any edit, uses the neutral disabled style, so its label stays readable in the dark theme instead of dark text on dark orange.
  - The key selector shows a translation's value once: the stored value appears under the page text only when the two differ. The panel has the modal's border and shadow, so it stands out from the page.

- 09029b0: `validateTranslations` now reports placeholder mismatches between plural forms through the new non-blocking `ValidationResult.warnings` array; previously the mismatch was computed and silently discarded.
- 09029b0: Node 18 reached end of life; the packages now declare `node >= 20`. No code changed.

  `@comvi/cli` and `@comvi/vite-plugin` are build-time tooling and keep their existing
  `node >= 22`.

- 09029b0: **Every runtime message opens with the name of the package whose code wrote it.** `[i18n]` and `[comvi]` become `[@comvi/core]` in core, `[@comvi/react]` and `[@comvi/vue]` in those bindings, and `[@comvi/next]` on next's `.use()` identity error; the in-context editor's `[ComviInContextEditor]`, `[InContextEditor]`, `[ElementHighlighter]` and `[comvi]` become `[@comvi/plugin-in-context-editor]`, and the CLI's `[comvi]` becomes `[@comvi/cli]`. A core message surfaced through a binding keeps `[@comvi/core]`. The sentence after the prefix is unchanged, except that a few messages that had no prefix gain one: core's plugin-initialization timeout and failure and its missing-tag-handler report, react's non-element tag handler error, the fetch loader's project-info, API, CDN HTTP and timeout errors, and the editor's console diagnostics. Core's `Locale is not set` and `` `messages` is not an object `` move from the `@comvi/core:` form to `[@comvi/core]`. Three catalog-level sentences now say messages, the catalog word: `No loader registered. Cannot reload messages.`, `Failed to reload messages` (core) and `Failed to refresh messages from the API.` (editor). Production error codes such as `E_ICU_SYNTAX` are unchanged.
- 09029b0: Fixed a stopped standalone activation's translation refresh being able to merge stale translations into the page after teardown or a replacement activation. The identity check now runs immediately before the merge (not only before the later render refresh), and outstanding refreshes are aborted on teardown.

## 0.4.1

### Patch Changes

- @comvi/plugin-fetch-loader@0.4.1

## 0.4.0

### Minor Changes

- 3c95b54: Passive UI-context collector for active in-context-editor sessions:
  - Observes visible translation targets (IntersectionObserver-driven, event-triggered, no polling) and sends structural/semantic/constraint signals plus neighbor key refs to the platform's context API — never rendered text.
  - Screens are grouped by an opaque digest of the normalized route by default; the new `screenGroupResolver` option lets integrations supply a readable, PII-free route template (e.g. `/users/:id`) instead. Modal id/testid/labelledby discriminators are digested, not sent verbatim.
  - Targets inside an open dialog get a modal-suffixed screen group; background keys keep the route group.
  - Mutation-class triggers (DOM/attribute/text/translation/route/resize) re-evaluate signals even when the visible key set is unchanged, so same-key drift converges; the transport's per-item hash gate keeps unchanged re-evaluations off the network, and failed batches retry instead of being dropped.
  - `collectContext: false` opts out entirely and is honored from both the plugin factory and standalone activation.

### Patch Changes

- 2aeb0d4: Reduce the editor's consumer bundle cost and harden browser storage:
  - npm ESM output is no longer minified; minification remains the standalone CDN build's responsibility
  - the Vue modal, key selector, and their CSS load on the first edit interaction while the Collector lifecycle remains active from plugin startup
  - stopped editor instances ignore late lazy imports and UI failures are reported without unhandled rejections
  - selected-language storage tolerates blocked reads/writes, malformed JSON, and non-array values
  - the insecure page-level API-key event channel remains disabled

- 8c4ed91: Pin the `@comvi/core` peer range to the minor line each release ships with (`^0.3.0` for 0.3.x, auto-synced to `^0.4.0` at the next release by `scripts/sync-peer-ranges.mjs`). Prevents the out-of-range escalation that turned the whole fixed group into a major bump at version time.
- Updated dependencies [01b40e9]
- Updated dependencies [60ee056]
- Updated dependencies [8c4ed91]
  - @comvi/plugin-fetch-loader@0.4.0

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

- a0906b6: Declare standalone IIFE as a side-effectful entry so bundlers do not tree-shake it.
- Updated dependencies [e1f4ccb]
- Updated dependencies [6e5370c]
  - @comvi/plugin-fetch-loader@0.3.0

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0
  - @comvi/plugin-fetch-loader@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1
  - @comvi/plugin-fetch-loader@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
  - @comvi/plugin-fetch-loader@1.0.0
