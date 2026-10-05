# Comvi examples

Seven small apps, each a demo page plus a second page, that demonstrate the same seven things
through seven different bindings. Open one in the browser, switch the language, and watch the
plural change.

| example                | binding                     | rendering            | typecheck        |
| ---------------------- | --------------------------- | -------------------- | ---------------- |
| [`react`](./react)     | `@comvi/react`              | client               | `tsc`            |
| [`vue`](./vue)         | `@comvi/vue`                | client               | `vue-tsc`        |
| [`svelte`](./svelte)   | `@comvi/svelte`             | client               | `svelte-check`   |
| [`solid`](./solid)     | `@comvi/solid`              | client               | `tsc`            |
| [`vanilla`](./vanilla) | `@comvi/core`, no framework | client               | `tsc`            |
| [`next`](./next)       | `@comvi/next`               | server, then hydrate | `tsc`            |
| [`nuxt`](./nuxt)       | `@comvi/nuxt`               | server, then hydrate | `nuxt typecheck` |

In `next` and `nuxt` the URL carries the locale: `/en`, `/uk` and `/de` are three real addresses,
the switcher navigates, and the page that comes back over the wire is already in the right
language. The other five hold the locale in memory.

## Open one in StackBlitz

Every example installs from npm and starts with one command, so StackBlitz runs it straight out of
the GitHub tree:

```
https://stackblitz.com/github/comvi-io/comvi-js/tree/<branch>/examples/<framework>
```

The examples depend on the published names (`"@comvi/react": "^0.5.0"`), never on `workspace:*`,
so a StackBlitz link works once the version it asks for is published. During a release candidate,
point the manifests at the `next` tag:

```bash
pnpm examples:use-tag next      # "@comvi/react": "next"
pnpm examples:use-tag ^0.5.0    # back to the release range
pnpm examples:use-tag --print   # what each example asks for right now
```

## What each example shows

The same scenario everywhere, in the same order down the page:

1. **A locale switcher:** `en` / `uk` / `de`.
2. **A string with a parameter:** `greeting.hello`, `{name}`. The name is "Ada", or whatever
   `?name=…` in the address says; try `?name=<b>Grace</b>` to see that a parameter renders as
   text, never as markup.
3. **A plural:** `cart.items`, an ICU `plural` on a live counter.
4. **`<T>` with a tag:** `docs.read_more` holds `<link>…</link>`; the app decides that `<link>` is
   an `<a href>`. The vanilla example does the same through the string API and a tag handler.
5. **Date and number formatting:** `stats.summary` interpolates a formatted number and a formatted
   date.
6. **A lazy loader:** each catalog is a dynamic `import()`, so a locale's JSON is fetched the first
   time you select it.

7. **A second namespace:** `account`, on the second page. No `ns` list names it, so its catalog
   is fetched the first time that page is shown. See "The second namespace" below.

Three more rows sit under the first six, mainly for the browser suite (see "Running the scenario in
a browser"): a link to a **second page** (`/about`, a real route in `next` and `nuxt`, a
`history.pushState` view in the other five), a **fallback** row (`fallback.only_en` is missing
from `uk.json` on purpose, `fallback.nowhere` is in no catalog), and a **missing parameter** row
(`t("greeting.hello", {})`). The catalogs also hold `ar`, a right-to-left locale with two keys,
behind a hidden button rather than in the switcher.

The setup is one file per example. In `react`, `vue`, `svelte` and `solid` that file is the same
composition apart from the import specifier: ICU through the constructor's `compiler`, then
`.use(loader({…}))` (or `cdnLoader`, see "Connect to Comvi" below), then
`.use(localeDetector({…}))`. Here is `examples/react/src/i18n.ts` with its comments elided:

```ts title="src/i18n.ts"
import { createI18n, icuCompiler, loader } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const locales = ["en", "uk", "de"] as const;
export const rtlLocale = "ar";

const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;

const localCatalogs = {
  en: () => import("./locales/en.json"),
  uk: () => import("./locales/uk.json"),
  de: () => import("./locales/de.json"),
  ar: () => import("./locales/ar.json"),
  "en:account": () => import("./locales/account/en.json"),
  "uk:account": () => import("./locales/account/uk.json"),
  "de:account": () => import("./locales/account/de.json"),
  "ar:account": () => import("./locales/account/ar.json"),
};

const catalogs: ReturnType<typeof loader> = cdnUrl
  ? cdnLoader({ cdnUrl, fallback: localCatalogs })
  : loader(localCatalogs);

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
})
  .use(catalogs)
  .use(
    localeDetector({
      supportedLocales: [...locales],
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      fallbackLocale: "en",
    }),
  );
```

The three that depart from it:

- **Vanilla** composes the same chain from the core subpaths (`@comvi/core`, `@comvi/core/icu`,
  `@comvi/core/loader`) and side-effect-imports `@comvi/core/tags`, so plain `t()` parses
  `<tag>…</tag>`; the framework examples get tags through `<T>` instead.
- **Next** keeps the host in `examples/next/src/i18n/config.ts` and the routing in a separate
  `routing.ts`, because `middleware.ts` runs in the Edge runtime and must not import the composed
  host. `next.config.ts` points `withComvi({ config })` at the config module, the layout renders
  `<ComviProvider locale>` from `@comvi/next/server`, and the pages call `getI18n({ locale })`.
- **Nuxt** names a Comvi package in one file only, `examples/nuxt/src/comvi.host.ts`: a factory
  that composes `icuCompiler` and `loader(map)` on the options Nuxt resolved. `useI18n()`, `<T>`
  and `useSwitchLocalePath()` are auto-imported, and `src/app.vue` calls `useLocaleHead()`.

Neither SSR example composes a locale detector: the URL is the source of truth there, and the
framework middleware decides the locale before the host runs.

## The second namespace

The second page renders three rows from a namespace of its own, `account`: a parameter
(`profile.signed_in`), a plural (`profile.devices`) and a key only `account/en.json` has
(`profile.only_en`). The import map names each catalog by its `locale:namespace` key, and nothing
lists `account` in `ns`, so the first page never loads it.

| example                   | how the second page gets `account`                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| react, vue, svelte, solid | `src/Account.*`: `useI18n("account")` scopes `t()`, `useI18nLoader().addActiveNamespace("account")` loads it, and the rows wait for that to settle                               |
| vanilla                   | `i18n.addActiveNamespace("account")` when the view is first shown, then `t(key, { ns: "account" })` on every call                                                                |
| next                      | `about/layout.tsx` renders `<ComviProvider namespaces={["default", "account"]}>`; the page calls `getI18n({ locale, ns: "account" })`, the client component `useI18n("account")` |
| nuxt                      | `pages/about.vue` awaits `useI18nLoader().addActiveNamespace("account")` in its setup and reads through `useI18n("account")`                                                     |

An activated namespace stays active: a locale switch on the second page fetches `account` for the
new locale together with the default namespace, and applies the locale only when both are in.

In the five client-rendered examples the browser loads a namespace for the active locale only. The
en-only row therefore shows its English text once `account/en.json` has been loaded, which is the
case when the page was opened in English, and shows the key when the page is first opened in
another locale. `next` and `nuxt` load the fallback chain on the server, so there the row is
English on a direct request for `/uk/about`.

## Connect to Comvi (opt-in)

Every example can read its catalogs from the platform CDN instead of the
bundled JSON. Set one variable when you build, and the host composes
`cdnLoader({ cdnUrl })` from `@comvi/plugin-fetch-loader` in place of the
import map:

| example                            | variable                                                   |
| ---------------------------------- | ---------------------------------------------------------- |
| react, vue, svelte, solid, vanilla | `VITE_COMVI_CDN_URL` (build time)                          |
| next                               | `NEXT_PUBLIC_COMVI_CDN_URL` (build time)                   |
| nuxt                               | `NUXT_PUBLIC_COMVI_CDN_URL` (runtime config `comviCdnUrl`) |

Unset, which is the default and what StackBlitz runs, the import map is the
only loader and nothing changes. Set, the same import map becomes the CDN
loader's `fallback`, so a CDN that cannot be reached still leaves the app in
its bundled language. The CDN serves `{cdnUrl}/{locale}.json` for
the default namespace and `{cdnUrl}/{namespace}/{locale}.json` for the rest.

## The catalogs

`examples/locales` is the single source: `{en,uk,de,ar}.json` are the default namespace, and
`account/{en,uk,de,ar}.json` is the `account` namespace, the layout the CDN serves. StackBlitz
opens one directory out of the tree, so the catalogs are copied into
`examples/<framework>/src/locales/` rather than symlinked.
Edit the shared copy, then:

```bash
pnpm examples:sync-locales                        # re-copy into all seven
node scripts/examples-sync-locales.mjs --check    # fail if a copy drifted
```

## Verifying locally

The examples are not pnpm workspace members, so a plain `pnpm install` at the repository root
ignores them. `examples:verify` builds the workspace, packs every package, copies each example to a
temp directory, pins every `@comvi/*` to a local tarball through `pnpm.overrides`, and runs
`pnpm install`, `pnpm build` and the example's own `typecheck` there. The committed `^0.5.0` ranges
are never rewritten.

```bash
pnpm examples:verify                               # all seven
pnpm examples:verify --only next                   # one
pnpm examples:verify --no-build --no-pack --keep   # re-run against the tarballs on disk
```

A green run says the source compiles under these manifests, not that `^0.5.0` is satisfiable;
only publishing settles that. Re-run the gate after the version bump.

## Connect to Comvi (opt-in)

Every example can read its catalogs from the platform CDN instead of the
bundled JSON. Set one variable when you build, and the host composes
`cdnLoader({ cdnUrl })` from `@comvi/plugin-fetch-loader` in place of the
import map:

| example                            | variable                                                   |
| ---------------------------------- | ---------------------------------------------------------- |
| react, vue, svelte, solid, vanilla | `VITE_COMVI_CDN_URL` (build time)                          |
| next                               | `NEXT_PUBLIC_COMVI_CDN_URL` (build time)                   |
| nuxt                               | `NUXT_PUBLIC_COMVI_CDN_URL` (runtime config `comviCdnUrl`) |

Unset, which is the default and what StackBlitz runs, the import map is the
only loader and nothing changes. The CDN serves `{cdnUrl}/{locale}.json` for
the default namespace and `{cdnUrl}/{namespace}/{locale}.json` for the rest.

## Running the scenario in a browser

`examples:verify` proves the seven compile. `examples:e2e` opens them: it
installs and builds each example exactly as `examples:verify` does, starts the
built app the way a reader would (`vite preview`, `next start`, or Nitro's
`.output/server/index.mjs`), and runs one Playwright spec against all seven
through the same `data-testid`s:

```bash
pnpm exec playwright install chromium   # once per machine
pnpm examples:e2e                       # all seven, bundled catalogs
pnpm examples:e2e --cdn                 # the same, catalogs from a mock CDN
pnpm examples:e2e --only react,next --no-build --no-pack --keep
```

The steps, each a column in the report. A step that cannot apply to an
example is `skip`, and the reason is printed under the table:

| step | asserts                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------- |
| a    | the first render is real text, and no catalog key appears anywhere in the page                          |
| b    | the switcher goes en → uk → de and the greeting follows                                                 |
| c    | the counter at 0, 1, 2 and 5 renders the catalog's plural branch in en, uk and de                       |
| d    | `<T>` renders `docs.read_more` with a real `<a href>` around the translated link text                   |
| e    | the "catalogs fetched so far" line starts at `en` and grows by one per visited locale                   |
| f    | next, nuxt: plain-HTTP `GET /uk` is already Ukrainian, and the hydrated page shows no key               |
| g    | no `console.error` and no uncaught exception during a full pass of its own                              |
| g2   | `--cdn`: g again in the dead-CDN build, past an allowlist of the refused-connection messages            |
| h    | the second page is translated, and the locale survives the link there, the link back and Back           |
| i    | next, nuxt: `/de` renders German, switching navigates to `/uk`, Back restores `/de`                     |
| j    | uk's catalog is requested only when uk is chosen (a Nuxt `<link rel="prefetch">` hint is not a load)    |
| k    | `--cdn`: the mock CDN served en, uk and de to this example, and nothing 404'd                           |
| k2   | `--cdn`: rebuilt against a CDN where nothing listens, the bundled `fallback` imports serve the catalogs |
| k3   | `--cdn`: the CDN's uk bundle lacks `fallback.only_en`, and the en value renders instead of the key      |
| l    | the en value fills the key uk lacks; `fallback.nowhere` renders as itself                               |
| m    | reload keeps uk (and next, nuxt: `/` returns to `/uk`); a fresh `de-DE` browser starts in German        |
| n    | `<html lang>` follows the locale and `dir` becomes `rtl` for `ar`                                       |
| o    | next, nuxt: from first paint through hydration the greeting is only ever the Ukrainian text             |
| p    | a missing parameter renders as its own placeholder, `{name}`                                            |
| q    | `?name=<img src=x onerror=…>` renders as text: no element is created and the handler never runs         |
| r    | every DOM state during en → uk → de is one whole language matching `<html lang>`, never a key           |
| s    | next, nuxt: a build with `defaultLocale: "uk"` serves `/uk` with the en value of an en-only key         |
| t    | `--cdn`, next, nuxt: `/uk` and `/de` rendered at once, both catalogs held, uk released first            |
| t2   | `--cdn`, next, nuxt: the same race, de released first                                                   |
| u    | `--cdn`: en → uk → de with uk's catalog answered last (vue, nuxt queue switches); the page stays German |
| v    | `--cdn`: uk's catalog request hangs; after the loader's timeout the bundled uk renders                  |
| v2   | `--cdn`: uk's catalog is corrupt JSON; the bundled uk renders                                           |
| w    | the first page never requests the `account` namespace; opening the second page loads it once            |
| x    | every DOM state of the second page during en → uk → de is one whole language, `account` rows included   |
| y    | next, nuxt: plain-HTTP `GET /uk/about` carries the `account` text and hydrates without refetching it    |
| z    | `--cdn`: in the dead-CDN build the bundled `locale:account` imports serve the namespace                 |

The critical texts (the greeting, the plural branches, `<T>`, the fallback row and
the placeholder) are written out literally in the spec, so a catalog that goes
wrong fails the suite instead of moving the expectation with it. Titles and the
second page are smoke checks read from `examples/locales/*.json`.

Every step also fails on its own if the page logs a `console.error` or throws,
so no verdict depends on which steps ran before it. A skip that the runner's
matrix does not list fails its step. A failing step stays red unless the
runner's `EXPECTED_FAILURES` names that framework, that step and a reference.
On any failure the reports, console logs,
server logs and Playwright traces are copied to `test-results/examples-e2e/`.

`--cdn` starts a small server that serves `examples/locales` in the CDN layout,
every message prefixed with `[CDN] `, and builds every example with its "Connect
to Comvi" variable pointing at it. The prefix is how the suite tells a text the
app read from the CDN from the same text out of its bundled `fallback` imports.
Column `k` reads that server's request log. Without it, a variable that
silently failed to apply would pass on the bundled import map. Each example is
then built a second time against a port where nothing listens, and `k2`, `z` and
`g` (as `g2`) run against that build, where the refused connections to the CDN
address are the only console errors allowed.

Steps t, t2, u, v and v2 steer that server, each on a fresh start of the
main build, so no catalog is cached from an earlier step. It can withhold a
locale's catalog until the test releases it, never answer, or answer with a
body that is not JSON. In t and t2 both server renders are provably waiting on
their catalogs before either is released. Every response must carry its own
`<html lang>`, plural and en-only key, and must hydrate in that locale. Next's
`[locale]` pages are prerendered, so these steps use `/<locale>/live`, the
same page under `force-dynamic`. Nuxt renders `/<locale>` per request already.

The server names a catalog as an import map does: `uk` is the default
namespace's file and `uk:account` the namespace's, so a step can hold one and
answer the other. Step x under `--cdn` holds both of the target locale's files,
answers the default namespace's first, and checks that the page is still the
old locale in full before it releases `account`'s. That applies where the
browser fetches the catalogs, in the five Vite examples and in `nuxt`. Next's
second page is prerendered and its browser fetches no catalog, so its switch
runs unheld.

`--tarballs <dir>` runs the suite against a release candidate's packed files
instead of packing the workspace. The release workflow packs once, runs both
modes this way and publishes the same files.

Steps r and x watch the DOM, not the screen. One state is one delivered batch of DOM
mutations, and every state must be the old locale in full, the new locale in full,
or the loading state. A mixed-language or raw-key state fails the step however
briefly it lasted. Step x watches the second page's default-namespace text and
its three `account` rows together, so a locale applied before the namespace
arrived is a mixed state. Under `--cdn` each switch's catalog is held until the barrier
sees it, so the in-between state is observed every run. Failing states are printed
under the table and written to `test-results/examples-e2e/report.json`
(`report-cdn.json` for `--cdn`) under `findings.mixedStates`, with whether a paint
ran before the next state as diagnostics.

Every install resolves the whole `@comvi` scope from the tarballs under test:
`pnpm.overrides` pins each package, and the temp `.npmrc` points the scope at a
small local registry that serves only those tarballs. A peer no override
reaches, such as `@comvi/core` behind `@comvi/plugin-fetch-loader` in the Nuxt
example, therefore resolves to the same files and never to npm.

The run exits non-zero on any failure, and the failing assertion is printed
under the table.
