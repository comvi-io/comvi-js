# @comvi/next

## 0.5.0

### Minor Changes

- 09029b0: **BREAKING (breaking change on a 0.x minor):** `@comvi/next` gains a server factory that takes
  the instance you composed, and the server i18n becomes a once-cell that refuses two
  configuration sources.

  **New: `createNextI18nFromInstance(factory, options)`**, exported from `@comvi/next/server` and
  nowhere else. `createNextI18n` keeps its exact signature; its one behaviour change in this
  release is the dropped `compiler` default, in its own changeset.

  ```ts
  import "server-only";
  import { createI18n, createNextI18nFromInstance, loader } from "@comvi/next/server";

  export const { i18n, routing } = createNextI18nFromInstance(
    () => createI18n({ locale: "en", defaultNs: "default" }).use(loader(importMap)),
    { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
  );
  ```

  `NextServerInstance<D> = WrapperI18nInstance<D> & I18nLoaderApi` — the server always needs the
  loader; ICU and tag interpolation enter the graph only if your factory names them.
  Options are **routing only**; locale, fallback, namespaces, translations, API key, tags/ICU,
  loader and plugins belong to the instance factory and do not exist on the options type. The
  result is exactly `{ i18n, routing }` — no `.use*` methods — and your instance type is preserved
  exactly. The factory is resolved lazily by the first `result.i18n` access or the first server
  helper that needs the instance: exactly once, memoized, in either order. A factory that
  throws leaves the cell retryable; one that reads back the instance it is constructing throws
  a cycle error instead of recursing.

  **BREAKING: `setI18n` no longer overwrites silently.** 0.4.x let a second `setI18n(other)`
  replace the instance, last write wins. It now throws, in development **and** production,
  naming both sources:

  ```
  [@comvi/next] i18n already configured by createNextI18nFromInstance(); setI18n() is a second source. Configure it once — only a same-instance setI18n() repeats.
  ```

  `setI18n(i18n)` keeps its exact signature and stays the supported way to configure a
  `createNextI18n` result, and repeating it with the **same** instance is a no-op (setup
  modules commonly re-run). Migration: configure from one source, once per process. Test
  suites that re-`setI18n`'d between cases need a fresh cell — vitest isolates module state
  per test file, and in-repo suites call the `@internal` `_resetServerI18n()` from
  `@comvi/next/dist/server/cache`.

  The client inherits react's hook migration verbatim: `@comvi/next/client` exports
  `useI18nLoader()` and `useI18nPlugins()` alongside `useI18n`, and there is no next-specific
  hook API. Its documented recipe is a base instance hydrated from the catalog the server
  serialized, through `<I18nProvider messages>`. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §5.

- 09029b0: **BREAKING (breaking change on a 0.x minor): `createNextI18n` no longer defaults the compiler to `icuCompiler`.** Pass `compiler: icuCompiler` from `@comvi/next` (or `@comvi/core/icu`) if your catalogs use `plural`, `select` or `selectordinal`. It was the last constructor in the repo that turned ICU on by itself, and one instance quietly compiling a grammar every other instance refuses is the kind of difference that only shows up when an app moves a catalog between them.

  Without the option an ICU message is not silently wrong, it is loud: development throws `E_ICU_SYNTAX` at ingestion, naming the option and the specifier, and production renders the braced message literally and reports it once. So the upgrade is a build-time failure in development, not a production surprise.

  ```diff
  -import { createNextI18n } from "@comvi/next";
  +import { createNextI18n, icuCompiler } from "@comvi/next";

   export const { i18n, routing } = createNextI18n({
     locales: ["en", "uk"],
     defaultLocale: "en",
  +  compiler: icuCompiler,
     messages: { en: { items: "{count, plural, one {# item} other {# items}}" } },
   });
  ```

  Every other capability `createNextI18n` composes — ambient tags, the loader with both `registerLoader` overloads, the plugins capability, default params, devtools discovery — is unchanged. The CDN global is unchanged too, and stays fully composed: a `<script src>` has no tree-shaking, so there is no byte choice to offer there.

- 09029b0: **BREAKING (breaking change on a 0.x minor): `<T>` from `@comvi/next/client` no longer enables
  ambient string-API tag syntax.** The component is React's exact `T` binding and now reaches
  the pure `@comvi/core/rich-text` seam: it still renders rich text with the same `components`
  API, but importing or rendering it no longer changes later `i18n.t("<tag>…</tag>")` calls.

  This removes a module-global side effect from native ESM and from webpack development
  graphs. If string-API `t()` must parse tag markup, `import "@comvi/core/tags"` explicitly at
  the application entry.

- 09029b0: **BREAKING (breaking change on a 0.x minor): `createI18n` from `@comvi/next/client` now builds the base instance.** That name is published 0.4.x API — on the client entry, on `@comvi/next/server` and on the `@comvi/next` root — and in 0.4 it arrived with ICU, tag syntax, async loading, the plugins capability and devtools discovery already attached. Those five are now things a next app composes. **ICU plurals THROW instead of rendering wrong text**: development throws `E_ICU_SYNTAX` at ingestion, production renders the braced segment literally and reports it through `onError`.

  **Grep target for a tree built against 0.5 development:** the second constructor name that briefly stood beside `createI18n` on both entries for the bare instance was `createSlimI18n`. It is deleted — one instance, one name — it never published, so rename it to `createI18n`, aliased imports included.

  **`createNextI18n` from `@comvi/next` keeps every capability.** It composes ambient tags, the
  loader (both `registerLoader` overloads), the plugins capability, default params and devtools
  discovery explicitly, inside this package, so it is still the one-line escape hatch if you do
  not want to compose anything. The compiler is the exception, and it is a separate breaking
  change in its own changeset: `createNextI18n` no longer defaults `compiler` to `icuCompiler`,
  so an ICU catalog needs `compiler: icuCompiler` here as well. Its instance type is now published
  as `NextComposedI18n<D>`. Nothing about
  `<I18nProvider>`, `useI18n()`, `<T>`, the capability hooks, `createMiddleware`,
  `createNextI18nFromInstance`, locale routing or navigation changes here.

  Compose what you had back — every installer is re-exported from BOTH runtime entries, so each
  fix stays inside the specifier you already import:

  | you had                                      | you add                                            |
  | -------------------------------------------- | -------------------------------------------------- |
  | ICU plurals, select, selectordinal           | `compiler: icuCompiler` in the constructor options |
  | loader (`registerLoader`, …)                 | `.use(loader(map))`, or `.use(attachLoader)`       |
  | `.use(plugin)`, `onMissingKey`               | `.use(definePlugin(p))`, or `registerPlugin(p)`    |
  | discovery (`instanceId`, `window.__COMVI__`) | `.use(devtools({ instanceId }))`                   |
  | `<tag>` markup through `t()`                 | render `<T>`, or `import "@comvi/core/tags"`       |

  ```tsx
  // INLINE — the constructor ingests the catalog.
  const i18n = createI18n({ locale: "en", compiler: icuCompiler, messages });
  // LATER — a hydrated client catalog, or anything an SSR loader fetches: the same option.
  const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(loader(importMap));
  ```

  `compiler` is a constructor field held for the instance's life, so one option covers every
  catalog source. A client instance is hydrated rather than loaded, so nothing is ingested at
  construction, and the option covers the hydrated catalog too.
  `@comvi/next/server` exports that same base `createI18n` — the client/server split is a
  runtime split, never an instance-tier split.

  Residual: `t("Click <b>here</b>")` returns markup as text, since neither entry registers tag
  syntax ambiently. See the
  [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md) §5 and
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

- 09029b0: **`@comvi/next/client` now really does re-export react's whole 0.5 surface: `useI18nInstance` and
  `ComponentMap` were missing.** The README says this entry carries react's 0.5.0 surface, and it
  carried all of it except those two: `useI18nInstance()` — THE name for "give me the instance" in
  `@comvi/react`, `@comvi/solid` and `@comvi/svelte`, added there in this same release — and
  `ComponentMap`, the type a `<T components={…}>` map is annotated with. A next client component
  that wanted either had to import `@comvi/react` beside this package, which is exactly the second
  specifier this entry exists to avoid. Both are named re-exports of react's own bindings, so the
  value is identical (`client.useI18nInstance === react.useI18nInstance`) and the type is react's, pinned by
  `tests/entry-surfaces.test.tsx` and `tests/types/client-surface.test-d.ts`. Purely additive.
- 09029b0: `createNextI18n({ messages })` takes the inline catalog, and the server helper is `loadMessages()` with `LoadMessagesOptions` and a `MessagesMap` result. The `translation` option and `loadTranslations()` are removed.
- 09029b0: **Peer ranges are now `next: "^15.0.0 || ^16.0.0"` and `react: "^18.2.0 || ^19.0.0"`.** Next 16 is
  added because it was tested; Next 14 is removed as unverified; and the React floor rises to 18.2
  because that is the floor every supported Next declares.

  Next 16 was blocked by a range that predated it, so `npm install @comvi/next` in a
  `create-next-app@latest` app (Next 16.3.5) failed with `ERESOLVE`. It is now supported, on evidence:
  the package's own suite (37 files, 418 tests) and all five type programs pass identically on 15.5.9
  and 16.3.5, `test-apps/next` type-checks/builds/lints on both, and `check:snippets:types` compiles
  all 59 documentation fences against Next 16's own `.d.ts` with the same 19 advisories as on 15. The
  surfaces the unit suite mocks were exercised against a real Next 16 server: `createMiddleware` for
  all three `NextResponse` verbs (`/` → 307 `/en`, `/uk/pro-nas` → 200 via rewrite, `/uk/about` → 307
  → `/uk/pro-nas`), `getLocale()` reading `x-comvi-locale` through `next/headers`, `createGetPathname`,
  `hasLocale`, and every member of `@comvi/next/navigation` including `push`/`replace`/`back`/
  `forward`/`refresh`/`prefetch` driven in a browser. Rendered markup was byte-identical to Next 15
  across nine routes, and the console was clean.

  **`^14.0.0` is dropped as unverified.** Supporting Next 14 is not a third value on one axis — it is a
  separate axis, because `next@14.2.35` peers `react: "^18.2.0"` and refuses React 19, so a 14 leg has
  to move `react`, `react-dom`, `@types/react` and the `@comvi/react` workspace dependency with it.
  Nothing in this repo or its CI has ever run that combination, and an untested combination is not
  something a published manifest may assert.

  What was observed, on a throwaway install with only `next` swapped: the package's own suite is
  **green** on 14.2.35 (37 files, 420 tests, all five type programs, lint, build), but a real app is
  not. `test-apps/next` cannot build at all — `Error: Configuring Next.js via 'next.config.ts' is not
supported`, a Next 15 feature — and a probe app with a `next.config.mjs` returns HTTP 500 on every
  page:

  ```
  TypeError: Cannot redefine property: I18nProvider
  Error: Cannot find module './nextPlugin.js'   (MODULE_NOT_FOUND)
  ```

  after a build-time `Attempted import error: 'I18nProvider' is not exported from
'@comvi/next/client'`. That reproduces on React 18.3.1 as well as 19.2.4, so it is not merely the
  React mismatch. It is recorded as a signal, not as the reason: the probe pinned React in one app
  while `@comvi/react` stayed on 19, which is not the coherent React 18 tree a real 14 user would
  have. Calling Next 14 broken would overstate what was run.

  **The route back:** run a 14-on-React-18 leg — `next@14.2.35` with `react`/`react-dom`/`@types/react`
  and `@comvi/react` all on React 18, and a `next.config.mjs` fixture. If that passes, `^14.0.0` can
  return to the range. Until then the range says only what has been demonstrated.

  There are no external users, so the narrowing breaks nobody.

  **The React floor is Next's own, not a choice of ours.** Read from the manifests in the worktree:

  ```
  next@14.2.35 -> react: ^18.2.0
  next@15.5.9  -> react: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
  next@15.5.18 -> react: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
  next@16.3.5  -> react: ^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0
  ```

  Every supported Next floors React at 18.2, so the old `react: "^18.0.0 || ^19.0.0"` advertised React
  18.0 and 18.1 alongside Next 15 or 16 — a pairing Next refuses, which would hand a reader on React
  18.1 an `ERESOLVE` naming _this_ package for a constraint that is Next's. Raised to
  `"^18.2.0 || ^19.0.0"`.

  **`@comvi/react` and the other bindings keep `^18.0.0` and are untouched.** That floor is ours and it
  is correct: `useSyncExternalStore` lands in React 18.0. Only the Next binding inherits Next's 18.2
  constraint. In the root README the two install lines sit adjacent —
  `@comvi/react  # Peer: react ^18 || ^19` directly above `@comvi/next  # Peers: next …, react ^18.2 ||
^19` — and that difference is deliberate, not drift.

  **The declaration sites are now guarded.** `next` was written in four places and `react` in three of
  them, with nothing tying any of it together — `scripts/sync-peer-ranges.mjs` only pins internal
  `@comvi/*` peers, and `tooling/check-package-contracts.mjs` had no peer logic at all. Both ranges
  were wrong at the same time, which is what a guard is for.

  `checkNextPeerRangeDeclarations` in that file now treats `packages/next/package.json` as the single
  source for **both** peers and fails the gate when a mirror disagrees, when a README's
  `# Peers: next …, react …` comment has been renamed away (so it cannot pass by matching nothing),
  when the stub's version falls outside the `next` range, or when either range is not a caret union
  the prose form can be derived from. It keys on the combined comment naming _both_ peers, so the
  adjacent `@comvi/react` and `@comvi/nuxt` install lines cannot be swept up — there is a test for
  exactly that. The prose shorthand drops trailing zero components, so `^15.0.0` renders `^15` while
  `^18.2.0` keeps its minor as `^18.2`. The stub is checked for satisfaction rather than equality,
  because it is pinned to the range's floor on purpose: pinning it to the newest major would stop
  proving the lowest supported Next resolves.

  Every failure mode was observed red and restored to green before the check was kept — including the
  full gate exiting 1 on each of the two axes — and eleven unit tests in
  `tooling/check-package-contracts.test.mjs` cover them.

- 09029b0: `useI18nLoader()` now hands out `removeActiveNamespace(ns)` and `removeActiveNamespaces(ns[])`
  alongside `addActiveNamespace(s)`.

  They are core's new deactivation: the namespace leaves `getActiveNamespaces()`, its in-flight
  load is cancelled, and a `configChanged` event re-renders anything reading the active set.
  Content already in the cache is untouched — `clearMessages()` is content-only in every form
  now, so it no longer deactivates anything.

- 09029b0: **`@comvi/next/server` now guards itself against the client bundle, so you can drop `server-only`
  from your app.** The entry imports `server-only` itself, and `@comvi/next` depends on it. A Client
  Component that imports `@comvi/next/server`, directly or through your own server module, fails
  `next build` with Next's message:

  ```text
  'server-only' cannot be imported from a Client Component module. It should only be used from a Server Component.
  ```

  This holds under webpack and Turbopack. Server Components and Route Handlers import it exactly as
  before.

  `package.json` now lists `dist/server.js` and `dist/server.dev.js` in `sideEffects` instead of
  `false`, so no bundler drops the guard. A bundler that builds `@comvi/next/server` outside Next must
  resolve with the `react-server` condition, as Next's server layer does, or the bundle throws on load.

  To migrate, remove `import "server-only";` from your server module and run
  `npm uninstall server-only` if nothing else in your app imports it. Keeping both is harmless.

  `@comvi/next/middleware` has no guard: middleware never enters the client graph, and the guard
  would make plain-node unit tests of your middleware throw.

- 09029b0: `createMiddleware` and `defineRouting` take the locale options `@comvi/nuxt` takes, normalized by one shared schema: `localeCookie` (a name, `{ name, maxAge, secure, sameSite, domain }` or `false`) and `localeDetection` (`{ order, queryParam, headerName, resolveAcceptLanguage }` or `false`), so `?lang=de` can pick the locale and persistence can be turned off; `localeDetection.cookieName` and `cookieSecure` are gone. Every error and warning starts `[@comvi/next]`, and the not-configured, no-loader and failed-load messages share their wording with `@comvi/nuxt`.
- 09029b0: Locale routing internals now run on one shared implementation, so this package and `@comvi/nuxt` can no longer drift apart. The shared code is workspace-private and is bundled into this package's own build — **no new dependency, nothing extra to install**. Two URL behaviors change:
  - **Trailing slashes are preserved when a locale prefix is stripped.** `stripLocalePrefix("/de/about/")` now returns `/about/` (was `/about`). Consequences: the middleware no longer normalizes trailing slashes via redirect — a request to `/de/about/` was previously redirected to `/de/about` and is now served as-is; link localization keeps the slash — `localizeHref("/de/about/", "en")` in `as-needed` mode now yields `/about/` (was `/about`).
  - **Interior duplicate slashes are no longer collapsed.** `stripLocalePrefix("/de//x")` now returns `//x` (was `/x`), so the middleware no longer issues slash-collapsing redirects for such paths.

  Paths without a locale prefix, the pathnames slug map, prefix modes, and root-path handling (`/` ⇄ `/de`) are unchanged.

- 09029b0: **Added: the capability toolkit on both `@comvi/next/client` and `@comvi/next/server`.** A
  next app no longer names `@comvi/core` to build an instance on either side of the boundary.

  | export                    | on   | what it is                                                       |
  | ------------------------- | ---- | ---------------------------------------------------------------- |
  | `createI18n`              | both | core's base instance constructor, the same binding on each entry |
  | `icuCompiler`             | both | the ICU compiler, from core's pure `/icu` subpath                |
  | `loader`, `attachLoader`  | both | from core's pure `/loader` subpath                               |
  | `plugins`, `definePlugin` | both | from core's pure `/plugins` subpath                              |
  | `devtools`                | both | from core's pure `/devtools` subpath                             |

  `DevtoolsOptions` comes with them as a type. `attachPlugins` / `attachDevtools` are not on
  these entries: they are the low-level pair `plugins()` / `devtools()` already configure, and they
  stay on `@comvi/core/plugins` and `@comvi/core/devtools` (see `roots-drop-attach-pair.md`). The server entry carries the toolkit because
  `NextServerInstance = WrapperI18nInstance & I18nLoaderApi` makes the loader **mandatory** for SSR —
  the one instance an app cannot avoid composing should not take a second package to compose.

  One constructor name on two entries: the client/server split is a RUNTIME split — which
  helpers are reachable — never an instance-tier split. The semantics of that name changed in this
  release; `next-single-entry-convergence.md` leads with the break and carries the migration
  table.

  `@comvi/next/server` exports **no** composed constructor and no tag entry, because a server
  graph reaching for the 0.4 composed recipe would pull in ICU and core's ambient
  tag-registration chunk. The published composed instance stays exactly where it was —
  `createNextI18n` from `@comvi/next`.

  The re-exports cost nothing: they are **named** re-exports of core's own bindings, from
  core's pure subpaths only — never `export *`, and never through `@comvi/react` — so the
  capability entries an app never calls stay out of its graph. `@comvi/core/tags` is
  deliberately not among them.

- 09029b0: `createNextI18n(…).use(installer)` is the one composition verb; runtime scoping moves onto
  `nextPlugin` / `nextPluginLazy`; the four scoped delegates are deleted; `compiler` is an option;
  `createNextI18nFromInstance` builds its instance eagerly.

  **`use` is core's installer pipe now.** `result.use(f)` is `f(result.i18n)` and hands back the same
  result with `i18n` retyped to what the installer widened the instance to — the same contract as
  `i18n.use(…)` on every instance, with the same identity guard: an installer that returns a different
  object, an async one, or a raw plugin throws `code: "E_USE_INSTANCE_IDENTITY"` (reported over
  `result.i18n`; a raw async plugin's rejection is swallowed so that error is the only report), and
  all three are TypeScript errors first. The 0.4 `use(plugin, options)` — Next's own scoped
  raw-plugin queue, one word away from the SDK's composition verb with the opposite timing — is gone.

  **Scoping lives on the plugin form.** Two installers, exported from `@comvi/next`, `/client` and
  `/server`:

  ```ts
  nextPlugin(plugin, { runtime?: "client" | "server", environment?: "all" | "development" | "production", ...PluginOptions })
  nextPluginLazy(load, { ...the same })   // load: () => Promise<plugin | { default: plugin }>, imported at most once
  ```

  Each is `attachPlugins(instance).registerPlugin(scoped, rest)` as an installer, so it attaches the plugins
  capability if the chain has not and sits anywhere in the chain before `init()`. `NextPluginOptions` is the
  published options type; `LazyPluginModule` / `LazyPluginLoader` keep their names. `UsePluginOptions`
  and `ScopedPluginOptions` are gone with the method they typed.

  **Deleted, not deprecated:** `useClient`, `useServer`, `useClientLazy`, `useServerLazy` (the 0.6.0
  removal pulled forward). The rename table:

  | 0.4                                               | 0.5                                                              |
  | ------------------------------------------------- | ---------------------------------------------------------------- |
  | `.use(Plugin())`                                  | `.use(nextPlugin(Plugin()))`                                     |
  | `.use(FetchLoader(o))`                            | `.use(fetchLoader(o))`                                           |
  | `.use(Plugin(), { runtime, environment, …opts })` | `.use(nextPlugin(Plugin(), { runtime, environment, …opts }))`    |
  | `.use(load, { lazy: true, …opts })`               | `.use(nextPluginLazy(load, { …opts }))`                          |
  | `.useClient(p, o)` / `.useServer(p, o)`           | `.use(nextPlugin(p, { …o, runtime: "client" \| "server" }))`     |
  | `.useClientLazy(l, o)` / `.useServerLazy(l, o)`   | `.use(nextPluginLazy(l, { …o, runtime: "client" \| "server" }))` |

  Pick the installer where you write the call: `lazy` is no longer an option a value can decide at
  runtime. `useClient` / `useServer` already fixed `runtime`, so drop it from the options when you
  move such a call onto `nextPlugin`.

  **`localeDetector()` must not be composed on this instance.** It is process-wide on the App Router, so
  the first request's headers would pin the locale for every later render; use
  `nextPlugin(localeDetectorPlugin(…), { runtime: "client" })`.

  **`compiler?: MessageCompiler` on `CreateNextI18nOptions`**, with NO default (see
  `next-no-icu-default.md`), so ICU is the same single switch here as on
  `createI18n` — pass your own compiler to opt out. The hardcode in the composed-instance builder is
  removed. `apiKey` / `devMode` are documented for what they are: forwarded to the instance for a
  fetch-loader plugin to read; this factory loads nothing on its own.

  **`createNextI18nFromInstance` is eager.** It promised the factory would run lazily on first `result.i18n`
  access while its documented example destructured `i18n` at module scope, hitting the getter at once.
  The factory now runs exactly once, inside the call, `i18n` is a plain field, and the once-cell's
  factory / resolving / cycle / retry machinery is deleted. The two-source conflict is checked BEFORE
  the factory runs, and a throwing factory leaves nothing configured. No test depended on laziness for
  anything but itself: the lazy-trigger, cycle and retry cases were rewritten to pin the eager
  contract.

  **The root carries the toolkit.** `icuCompiler`, `loader`, `attachLoader`, `plugins`,
  `definePlugin`, `devtools` (and `DevtoolsOptions`) are now
  re-exported from `@comvi/next` as well, because a shared `i18n/config.ts` is imported by both
  runtimes and can name neither `/client` (`"use client"`) nor `/server` (`next/headers`). A new size
  row, `fw-next-root-composed`, gates the recommended path.

  Migration of the documented config file:

  ```diff
  -import { createNextI18n } from "@comvi/next";
  +import { createNextI18n, loader, nextPluginLazy } from "@comvi/next";

  -export const nextI18n = createNextI18n({ ...routing, fallbackLocale: "en" });
  -nextI18n.i18n.registerLoader({ en: () => import("./locales/en.json"), uk: () => import("./locales/uk.json") });
  -nextI18n.useClientLazy(
  -  () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
  -  { environment: "development", required: false },
  -);
  -export const { i18n } = nextI18n;
  +export const { i18n } = createNextI18n({ ...routing, fallbackLocale: "en" })
  +  .use(loader({ en: () => import("./locales/en.json"), uk: () => import("./locales/uk.json") }))
  +  .use(
  +    nextPluginLazy(
  +      () => import("@comvi/plugin-in-context-editor").then((m) => m.inContextEditorPlugin()),
  +      { runtime: "client", environment: "development", required: false },
  +    ),
  +  );
  ```

- 09029b0: Add `withComvi({ config })` in `@comvi/next/plugin` and the server `<ComviProvider>`, so a Next app needs no `setI18n()` module and no `"use client"` wrapper. Pages call `getI18n({ locale })`, and the manual setup keeps working unchanged.
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
- 09029b0: The two packages 0.5 extracted so that shared code has one copy — locale routing (next, nuxt) and the declaration emitter (cli, vite-plugin) — stay internal to the repository instead of being published. Each of these four packages now carries the shared implementation inside its own build, so **none of them gained a runtime dependency**: next bundles the routing primitives, nuxt ships them vendored into its runtime, and cli and vite-plugin bundle the emitter along with its declarations, so their published `.d.ts` still declare `SchemaParam`, `KeySchema` and `ProjectSchema` themselves. Nothing about the four packages' APIs changes and nothing extra is installed; the release train is 12 packages on one version.
- 09029b0: `createNextI18n`'s composed instance installs its import-map `registerLoader` overload with `Object.defineProperty` (non-enumerable, writable, configurable) instead of plain assignment. Behaviour is unchanged today — the property was already an own non-enumerable member from `attachLoader`, so assignment kept it hidden — but the reflective contract (`{...i18n}` carries data only) no longer depends on how the loader capability happens to be installed. Pinned by two new reflection tests, one of which fails under a prototype-installed loader with the old assignment.
- 09029b0: **Development build: the dev-only diagnostic now actually fires under a bundler's development condition.** The readable half of the `E_USE_INSTANCE_IDENTITY` error `createNextI18n(…).use` throws — the one that names `.use(definePlugin(f))` / `.use(nextPlugin(f, { runtime }))` and the installer-name rule — was dead code in the published package, so every consumer got the bare `"E_USE_INSTANCE_IDENTITY"` string instead, development included. `__DEV__` is a build-time define of OUR build, `vite build` pins `NODE_ENV=production`, and the package published exactly ONE artifact family, so the only files a consumer could resolve had `__DEV__: false` baked in no matter what mode the app built in.

  The package now publishes a second family — `dist/*.dev.js`, one file per module because `preserveModules` is what makes `"use client"` a per-file directive — and EVERY runtime entry (`.`, `./server`, `./client`, `./middleware`, `./routing`, `./navigation`) answers the `"development"` condition with its `.dev` counterpart, the pattern `@comvi/core` and `@comvi/vue` use. `"use client"` lands on the same five modules in both families (`client`, `client/I18nProvider`, `navigation`, `routing/Link`, `routing/hooks`), so a Next dev build gets the same client/server split it always had. Every production file is byte-for-byte what it was — no row of the size gate moved — and `types` is unchanged and shared by both families. The claim is gated on the DIST from now on: the bundler-matrix `next-dev-conditions` case bundles a consumer that defines nothing, once per mode per bundler, triggers the error for real, and asserts the readable text is in the development bundle and out of the production one.

- 09029b0: The `routing` that `createNextI18n` and `createNextI18nFromInstance` return keeps `localeCookie`. Both rebuilt it from `locales`, `defaultLocale`, `localePrefix` and `pathnames` only, so it named the default `NEXT_LOCALE`, and a client-side locale switch under `<ComviProvider>` wrote that cookie even when the app configured another name or `localeCookie: false`.
- 09029b0: `getLocale()` now honours the `x-comvi-locale` header only when it is in `routing.locales` (from the config module or `createNextI18nFromInstance`), or a well-formed locale code without routing; runtime texts say "i18n instance", and the no-loader warning names `.use(cdnLoader({ cdnUrl }))` or `.use(loader(map))`.
- 09029b0: A locale switch can return to the default locale under `localePrefix: "as-needed"`, and switches at all under `"never"`. `useLocalizedRouter().push(href, locale)` / `.replace(href, locale)` and `<Link locale>` produced the unprefixed URL for the default locale; the middleware resolved that URL from the `NEXT_LOCALE` cookie, which still held the locale being left, and redirected straight back.

  A navigation that names another locale than the current one now goes to the locale-prefixed URL (`/en/about`), which the middleware reads as an explicit choice: it records the locale in the cookie and redirects to the public URL (`/about`). The switch also writes the cookie in the browser, with the name and attributes `localeCookie` configures, because Next answers a cached navigation without a request. `<Link>` to another locale is no longer prefetched: the prefetch went through the middleware and moved the cookie to that locale without a click.

  A first visit without a cookie is detected as before, and a direct visit to an unprefixed URL with a stored locale is still redirected to that locale.

  The middleware now writes the locale cookie for a page the browser loads (`Sec-Fetch-Dest: document`, or a request without that header) and for a redirect away from a locale-prefixed URL, and no longer for the other fetches Next's client router makes. Next 16 re-prefetches the links of the page being left, and recording those moved the cookie back to the locale just switched away from. `useLocalizedRouter()` and `<Link locale>` record a switch in the browser, without a `routing` prop too (in `NEXT_LOCALE`). A client navigation through a plain `next/link` to another locale's URL is recorded at the next page load of that locale.

  `<I18nProvider routing>` keeps the public URL in the address bar: Next 16 answers a repeated switch from its client cache and left `/en/about` standing where the middleware redirects to `/about`.

- 09029b0: **The server adapters no longer repeat a fallback load core has made.** `@comvi/core` now loads the
  fallback chain itself at `init()` and on a namespace activation. The Next and Nuxt server paths
  went on loading it as well, so a fallback catalog that fails to load was requested and reported
  twice per request, and in Nuxt a chain reload racing core's activation cancelled and refetched
  catalogs that were loading fine. A catalog that fails inside core's own load is now remembered for
  the request and not attempted again, and Nuxt runs its own chain load after the activation
  instead of beside it. A pair that failed on the server is not in the hydration payload, so the
  browser asks for it once.
- 09029b0: `<I18nProvider>` now adds the catalog the server handed over before it switches the locale, on the first mount and on every navigation, so the browser never re-fetches that catalog and the translated text commits in the same render as the new `<html lang>`.
- 09029b0: **SSR correctness: `<I18nProvider>` no longer writes the shared i18n instance during a server
  render.**

  Your i18n instance is created once at module scope and shared by every request a Next.js server
  process handles. The provider used to assign `i18n.locale = locale` while rendering, so two
  requests for different locales that overlapped in the same process could read each other's locale:
  the first request's tree would finish rendering against the second request's locale. On a busy
  route that surfaced as pages served in the wrong language, and as hydration mismatches when the
  markup and the client disagreed.

  The locale assignment now happens on the client only, before the first commit. On the server the
  request locale reaches the tree through React context, exactly as it already did for `t()`,
  `<T>` and the formatters, so nothing about the rendered output changes for a single request.

  Validation of `routing.locales` still runs on the server, so a `[locale]` segment your routing
  config does not know about still reaches `onError` during SSR rather than waiting for a browser.

  `addMessages()` still runs on the server. It is additive and keyed by `locale:namespace`, so a
  concurrent request can only write what the other would have loaded anyway.

  The JSDoc example on `<I18nProvider>` now shows the `"use client"` wrapper component instead of
  importing the i18n instance straight into a Server Component. Next.js cannot pass a class instance
  across the RSC boundary, so the old example did not work as written.

- 09029b0: `<I18nProvider>` no longer writes the i18n instance during render: it passes `messages` to the React provider, applies the locale at commit, and renders a locale outside `routing.locales` in the i18n instance's locale on the server too.
- 09029b0: **The README quickstart's `page.tsx` now calls `setRequestLocale(locale)` too — the layout's call
  does not cover the page, and without it the first load of `/en` was an HTTP 500.** A previous fix
  added the call to the quickstart's layout fence and a probe that reads it, and that probe passed
  while the page fence beside it still went straight to `await getI18n()`. React can begin rendering
  the page while the layout is still awaiting its own `params`, so the page reached `getI18n()` with
  React's per-request cache still empty — `packages/next/src/server/getI18n.ts` says so in a comment
  ("A page can render before its layout completes") and then throws
  `[@comvi/next] Locale not set. Call setRequestLocale(locale) in your layout/page first, or configure
middleware.`

  Observed, not reasoned. The six quickstart fences extracted verbatim into a Next App Router app
  served `/en` as **HTTP 500** with that exact error — on `next@16.3.5` and on `next@15.5.9` alike, so
  it was never version-specific. With the call added, `/en` and `/uk` are both **200** and render
  `Hello, Server!` / `Привіт, Server!` with a clean server log.

  The prose above the fences said "the layout calls it", which is what made the hole look closed; it
  now says to call it at the top of **every** layout and page that later reaches a server helper, and
  says why the layout's call is not a guarantee.

  Docs only — no runtime change. **Pre-existing:** the page fence has never had the call.

  `packages/next/tests/readme-inline-quickstart.test.ts` now reads the quickstart's **page** fence as
  well as its layout fence, and asserts the call is there, that it comes from `@comvi/next/server`,
  that it precedes `await getI18n()`, and that the page takes `locale` from its own `params`. The
  probe was observed failing against the pre-fix README (2 failed / 4 passed) before it was kept.
  Neither `pnpm check:snippets` nor `pnpm check:snippets:types` could have caught this: the fence
  resolved every import and compiled clean, and what was missing was a statement, not a symbol — the
  same blind spot the layout fix recorded.

- 09029b0: **Docs only.** The README's table of three ways to get an instance read like three peer
  options; it is one: `createNextI18n(options).use(...)` is the recommendation,
  `createNextI18nFromInstance` is for an instance built elsewhere, and `createI18n` (still
  exported from both runtime entries) is for that factory and for 0.4 migration —
  demoted to a mention in the export table rather than a coequal choice.

  Added the two missing quickstarts, each a complete, lint-checked App Router app:
  an inline-catalog app (`createNextI18n({ messages, compiler: icuCompiler })`,
  no loader) and a `@comvi/plugin-fetch-loader` remote app
  (`createNextI18n(...).use(cdnLoader({ cdnUrl }))`). The CDN quickstart spells
  out the actual mechanism behind client-side ICU and the loader: the shared
  `i18n/config.ts` module is evaluated once on the server and once again inside
  the client bundle (`I18nClientProvider.tsx` imports it a second time, because
  Next cannot pass a class instance across the Server/Client Component
  boundary), so the client instance gets `compiler: icuCompiler` and the composed
  loader only because the same construction code runs twice — nothing is
  serialized from the running server instance to the browser. Both quickstarts
  were typechecked against a scratch copy of `test-apps/next` before writing.

  The inline quickstart's catalog is keyed `"<locale>:<namespace>"` (`"en:default"`), not nested
  `{ en: { default: … } }`: a colon-less top-level key is the LOCALE alone and its object is
  flattened into the default namespace, so the nested form defined `default.greeting` and
  `t("greeting")` rendered the literal key. Neither the snippet lint nor the snippet typecheck can
  see that, so the catalog is now read out of the README fence and RUN by
  `packages/next/tests/readme-inline-quickstart.test.ts`.

- 09029b0: **The README quickstart now calls `setRequestLocale(locale)`, without which it threw on first
  render.** Both quickstart layouts read `locale` from `params` and rendered, and the page then called
  `await getI18n()` — which reads the request locale from React's per-request cache and rejects with
  `[@comvi/next] Locale not set. Call setRequestLocale(locale) in your layout/page first, or configure
middleware.` when nothing filled it. Step 1 has no middleware, so nothing did. The name appeared
  nowhere in the README, not even in the `/server` entry's export list, while
  `examples/next/src/app/[locale]/layout.tsx` has called it all along.

  Docs only — no runtime change. **Pre-existing:** the base the wave-5 restructure started from
  (`7860364`) had no `setRequestLocale` either, so this is wave 4's hole carried forward rather than a
  wave-5 regression.

  `packages/next/tests/readme-inline-quickstart.test.ts` now reads the quickstart's layout fence and
  asserts the call is there, and that it comes from `@comvi/next/server`, before the provider renders.
  Neither `pnpm check:snippets` nor the type-checker could have caught this: the fence resolved every
  import and compiled clean, and what was missing was a statement, not a symbol.

- 09029b0: `NextRoutingOptions.locales` is now `readonly string[]`, so `defineRouting`'s own output can be
  spread into `createNextI18n`.

  Every other locale list in the package was already readonly — `RoutingConfig.locales`,
  `hasLocale`, and the middleware helpers — and nothing ever mutated this one. Demanding a mutable
  array made the package's documented composition uncompilable:

  ```ts
  const routing = defineRouting({ locales: ["en", "de"], defaultLocale: "en" } as const);
  createNextI18n({ ...routing, messages }); // TS2345 before this release
  ```

  It also rejected the `as const` locale tuple `hasLocale(routing.locales, locale)` needs for
  narrowing. Type-level only: no runtime behaviour changes, and a mutable `string[]` is still
  accepted, so nothing that compiled before stops compiling.

- 09029b0: `await getI18n()` now returns `locale` alongside `t` and `hasTranslation` — the locale it resolved
  for the request, and the exact string `t` closes over. Reading it saves a second `getLocale()` call,
  which could only ever disagree. `@comvi/nuxt`'s `useTranslation(event)` already returned it, so both
  server helpers are now `{ t, hasTranslation, locale }`. Additive: nothing that destructures the old
  two members changes.

  `Accept-Language` matching now lives in the shared locale routing primitives instead of the
  middleware: `createMiddleware` no longer carries a parser of its own, and `@comvi/nuxt` resolves
  headers through that same source, so the two frameworks provably answer identically for the same
  header. A custom `localeDetection.resolveAcceptLanguage` still overrides it, unchanged. No header
  changes the locale it resolved to in this release.

- 09029b0: **The server pipeline resolves every lookup against the request locale; the shared instance contributes
  catalog and loader only.**

  Your i18n instance is created once at module scope and shared by every request a Next.js server
  process handles. Every lookup under `getI18n()` already named the request locale explicitly, but
  nothing said so: it held because each call site happened to be written that way, and the next
  server helper someone added was free to translate through the instance and pick up its
  process-wide locale instead. That is now the type. The internal server instance type carries no `t` or
  `tRaw`, so a locale-implicit server lookup does not compile, and `getI18n()` reaches the
  translator through one named widening that binds the request locale into every call.

  `getI18n()` also resolves the request locale **before** it initializes the instance. A request that
  cannot determine its locale — no `setRequestLocale()`, no middleware header — now throws without
  having triggered the one-time `init()`, whose default-namespace load runs at the instance's own
  configured locale. Previously such a request initialized the instance as a side effect of failing.
  One consequence worth knowing: when both would have failed, the locale error now wins. A request
  with no locale against an instance whose `init()` throws reports `[@comvi/next] Locale not set.`
  rather than the initialization failure.

  Two writes still travel from a request to the shared instance, both unchanged and both
  deliberate: the server render's `addMessages()`, which is additive and keyed by
  `locale:namespace`, and `init()`'s one-time default-namespace load at the instance's own locale.
  The package's tests now pin that no request writes the shared instance's locale or its active
  namespaces.

  No API change. `createNextI18n()`, `setI18n()`, `createNextI18nFromInstance()`, `loadMessages()`,
  `setRequestLocale()` and `<I18nProvider>` all work exactly as before.

- 09029b0: Internal dedupe, behavior-preserving: the private `translationResultToString`/`virtualNodeToText` copies in `src/server/getI18n.ts` are deleted; the server helper imports `translationResultToString` from `@comvi/core` (identical implementation).
- 09029b0: **A direct load of a non-default locale no longer shows a raw key or breaks hydration.** When a key
  existed only in a `fallbackLocale` catalog (for example only in `en`), opening `/uk` directly
  rendered the English text on the server, but `loadMessages()` sent the client only the `uk`
  catalogs. After hydration the client rendered the raw key, React reported hydration error #418, and
  the page did not recover. Switching locales on the client was unaffected.

  `loadMessages(locale)` now returns the requested locale and every locale of the instance's
  `fallbackLocale` chain (a string or an array, in the order lookups walk it), for each requested
  namespace, and nothing outside that chain. The result is still keyed `locale:namespace`, so
  `<I18nProvider messages>` needs no change. `getI18n()` loads the same chain, so a server-side
  `t()` for a namespace loaded on demand also resolves through the fallback. Keep the client instance on
  the same `fallbackLocale` as the server instance; the documented setup shares one instance, which does
  this already.

- 09029b0: **Fix: `getI18n()` now loads the fallback chain even when the request locale is already cached.** It
  skipped loading whenever the request locale's catalog was in the cache, so a Server Component that
  called `getI18n()` without a prior `loadMessages()` rendered the raw key for a key that exists
  only in a `fallbackLocale` catalog. It now loads its namespace for every locale of the chain that is
  missing. Concurrent requests that need the same `locale:namespace` pair now share one fetch instead
  of starting two. A fallback catalog that fails to load is reported through `loadError`, and
  `onError` fires as well; the render continues. A failed catalog is attempted once per request, so
  `loadMessages()` does not retry what `getI18n()` already failed to load, and the client gets the
  catalogs the server render read. A fallback that keeps failing is retried on the next request that
  needs it.
- 09029b0: Trailing-slash and doubled-slash URLs no longer bypass the `pathnames` map. `/en/about/` and `/en//about` now resolve through the same mapping as `/en/about`, in the middleware rewrite, `localizePathname`, `usePathname` and `localizeUrlObject`, and the trailing slash is preserved on the result. Next's default 308 normalisation masked this; it showed under `trailingSlash: true` or `skipTrailingSlashRedirect: true`.

  A `pathnames` key or value that itself ends in `/` is matched on the same trimmed form as the input, so `"/about/"` as a key no longer self-redirects forever and `"/ueber-uns/"` as a value keeps its reverse mapping. A run of slashes left at the start of the path after the locale prefix is stripped collapses to one, so `/en//evil.com` can no longer become the protocol-relative `//evil.com`.

- 09029b0: `withComvi` now adds the `@comvi/next/config` alias to the config your own `webpack` function returns, so a fresh object or a replaced `resolve.alias` keeps it.
- 09029b0: **`<I18nProvider fallback>` gates the first paint.** Neither provider used to gate it, each README prescribed a different loading gate, and every CDN quickstart as written painted raw keys once before the catalog arrived. `fallback` — `ReactNode` in react, `JSX.Element` in solid — renders instead of the children until the instance is INITIALIZED, and the children replace it when initialization finishes. The axis is `isInitialized` (the same instance state `useI18n().isInitialized` reads), deliberately not `isInitializing`: `init()` starts from an effect, after the first render, so a gate on "is it initializing" is open for exactly the frame the raw keys would paint in. With `autoInit: false` the gate therefore holds until the app calls `i18n.init()` itself. Both branches render inside the provider, so the fallback may use the hooks. React's server snapshot keeps its contract — `ssrInitialIsInitializing` is `false` by default, so a server render is never gated and the hydration render reads that same snapshot; solid has no such snapshot, so `renderToString` (where no effect runs) paints the fallback, hydrates it consistently, and swaps once the client instance initializes. `fallback={undefined}` is the same as omitting it in BOTH bindings — the gate is
  `fallback !== undefined`, so a wrapper that forwards its own optional prop does not turn into a
  blank gate — while `fallback={null}` still is one. React's server render is not gated by default;
  pass `ssrInitialIsInitializing={true}` beside `fallback` to gate it, which is the recipe for a
  server render whose catalog is not in yet (`@comvi/next` passes `false` for you, so a `fallback`
  there is a post-hydration gate only). Purely additive — omit the prop and the rendered tree is
  what it was. Svelte has no provider component and vue's equivalent is a `<Suspense>`-shaped question; both document the three-line `{#if $isInitializing}` / `v-if="isInitializing"` gate in their README instead of growing an API, which is sound there because both start init synchronously before the first paint.
- 09029b0: **One name for the SSR render locale: `ssrLocale`.** `@comvi/solid` had no way to seed one, though it has `renderToString` and hydration, so a server render could only ever paint the instance's configured locale and the hydrating client silently disagreed with it until the first reactive update repainted. `<I18nProvider ssrLocale="fr">` now adopts that locale onto the instance during the render phase, before the locale signal is seeded — the same contract `@comvi/vue`'s option of that name has, and the reason `t()` and `locale()` cannot drift apart. Adopting it is a WRITE to `i18n.locale`, so a solid app that server-renders must build its instance inside the request handler: a module-scope instance shared by every concurrent request would carry one request's locale into another's tree. The package README's SSR section shows the per-request shape. **BREAKING (breaking change on a 0.x minor): `@comvi/react`'s render-locale prop is `ssrLocale` too**, the one cross-binding name; `ssrInitialLocale` is removed. React's `ssrInitialIsLoading` / `ssrInitialIsInitializing` are deliberately not ported — they exist for `useSyncExternalStore`'s server snapshot and are correctly react-only. `@comvi/next`'s own client provider passes `ssrLocale` internally and omits it from its own provider props, since it sets the render locale from its own `locale` prop and an `ssrLocale` passed there would be silently overridden.
- 09029b0: `MessagesMap` is now re-exported from `@comvi/core` instead of declared again, so every package names the same type.
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

- 09029b0: `createNextI18nFromHost()` is now `createNextI18nFromInstance()`, with `CreateNextI18nFromInstanceOptions` and `CreateNextI18nFromInstanceResult`.
- 09029b0: `useI18nHost` from `@comvi/next/client` is now `useI18nInstance`, `NextServerHost` is now `NextServerInstance`, and `UseHostIdentityError` is now `UseInstanceIdentityError`.
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
  - @comvi/react@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [67780e8]
  - @comvi/core@0.4.1
  - @comvi/react@0.4.1

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

- Updated dependencies [bec9ad6]
- Updated dependencies [a5c80b8]
- Updated dependencies [6463199]
- Updated dependencies [38ce169]
- Updated dependencies [aaea018]
  - @comvi/core@0.4.0
  - @comvi/react@0.4.0

## 0.3.0

### Minor Changes

- 6e5370c: **BREAKING: these packages are now ESM-only.**

  v0.3 targets the modern bundler-resolution toolchain. The CJS build (`require()` entry / `main` / `.cjs`) and the dual `.d.cts` type declarations are no longer published — each package ships a single ESM bundle plus one `.d.ts` per entry. Import via ESM or any modern bundler (Vite, webpack 5, esbuild, Rollup, Rspack, Next, etc.).
  - **Migration:** replace `const x = require("@comvi/…")` with `import x from "@comvi/…"`, or consume through a bundler. There is no `require()`/CJS entry point.
  - The CDN UMD/IIFE builds are unaffected: `@comvi/core` still ships `comvi-core.global.prod.js` (`unpkg`/`jsdelivr`), and `@comvi/plugin-in-context-editor` still ships `standalone.iife.js` (`./standalone`).
  - This removes the `emit-d-cts.mjs` post-build stopgap and all dual-format machinery; declarations are produced directly by the build (`vite-plugin-dts`) and resolve cleanly under bundler resolution.
  - `@comvi/solid` declarations are now correctly populated (`tsconfig` `rootDir`/`outDir` restored — previously the advertised `dist/index.d.ts` was an empty `export {}` stub).
  - Package metadata: `repository.url` carries the required `git+` prefix.

- 88ae52a: **Minor release — React 18+ baseline (via `@comvi/react`), render-time mutation removal, locale validation.**

  ### Added
  - Locale validation against `routing.locales` in `<I18nProvider>`. When the provider receives a `routing` prop and the `locale` prop is not in `routing.locales`, the provider calls `i18n.reportError(...)` with a descriptive diagnostic and skips the mutation. When `routing` is omitted, behavior is unchanged.

  ### Changed
  - `<I18nProvider>` internals: locale sync and message bootstrap moved from the render body to a `useState(() => ...)` lazy initializer. The previous render-time mutation pattern (`i18n.locale = locale`, `i18n.addTranslations(messages)` guarded by `isFirstRenderRef`) is replaced; the side effect now lives in a React-blessed lifecycle slot before the first commit. Behavior is identical from a consumer's perspective.
  - `<Link>`, `usePathname()`, and `useLocalizedRouter()` switched from `useI18n()` to `useLocale()` — non-translation routing consumers no longer re-render on namespace loads.

  ### Removed
  - React 16.8–17 peer support via the `@comvi/react` 0.3 release.
  - Duplicate `src/client/index.ts` re-export module — `src/client.ts` is the single source of truth for the `./client` subpath.

  ### Internal
  - Peer dependencies on `@comvi/core` and `@comvi/react` bumped accordingly.
  - New `next-hydration.test.tsx` asserts `renderToString` + `hydrateRoot` produces zero hydration warnings, and a boundary test asserts no `i18n.locale = …` mutation appears outside the dedicated `syncLocaleSafely` helper in `client/I18nProvider.tsx`.

  See CHANGELOG for the per-package upgrade checklist.

### Patch Changes

- e1f4ccb: Broaden `engines.node` from `>=22` to `>=18` for runtime packages.

  Runtime packages (the ones end-user apps install as dependencies) no longer
  require Node 22 — Node 18 LTS is enough. This matches the React/Vue/Solid/Svelte
  peer ecosystem support windows and unblocks consumers on Node 18/20 LTS.

  `@comvi/cli` and `@comvi/vite-plugin` keep `>=22` since they are build-time
  tools and Vite 7+ itself requires Node 22.12+. Node 22+ remains the recommended
  target for development and CI.

- a66dbc8: Re-export the v0.3 selector hooks from `@comvi/next/client`.

  `useLocale`, `useIsLoading`, `useSetLocaleTransition`, and `useFormatters` (plus the
  `UseSetLocaleTransitionReturn` and `UseFormattersReturn` types) are now re-exported
  from `@comvi/next/client`, matching `@comvi/react`. Previously these headline v0.3
  hooks were only reachable by adding a separate `@comvi/react` dependency, despite
  `@comvi/next/client` being the documented import path for Next apps.

- Updated dependencies [1feaed4]
- Updated dependencies [e1f4ccb]
- Updated dependencies [6e5370c]
- Updated dependencies [8e01e2b]
- Updated dependencies [88ae52a]
- Updated dependencies [88ae52a]
- Updated dependencies [4050429]
- Updated dependencies [872680e]
- Updated dependencies [c705faf]
  - @comvi/core@0.3.0
  - @comvi/react@0.3.0

## 0.2.0

### Minor Changes

- Coordinated `0.2.0` release across all `@comvi/*` packages. The CLI ships its first set of meaningful new features (`.env` auto-load, `namespaces` / `locales` config filters, terminology cleanup); the framework bindings, plugins, and core bump in lockstep so every package on a given install moves to the same baseline version.

### Patch Changes

- Updated dependencies
  - @comvi/core@0.2.0
  - @comvi/react@0.2.0

## 0.1.1

### Patch Changes

- 8c559e9: Republish all packages from CI via npm Trusted Publishing so every tarball ships with a signed provenance attestation linking it back to the comvi-io/comvi-js release.yml workflow run that built it.
- Updated dependencies [8c559e9]
  - @comvi/core@0.1.1
  - @comvi/react@0.1.1

## 0.1.0

### Minor Changes

- 947baf9: Initial public release of Comvi i18n.

### Patch Changes

- Updated dependencies [947baf9]
  - @comvi/core@1.0.0
  - @comvi/react@1.0.0
