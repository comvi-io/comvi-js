# Examples harness

How the nine apps in [`examples/`](../../examples) are built, typechecked and driven in a browser
before a release. The reader-facing description of the examples is
[`examples/README.md`](../../examples/README.md); this file is for maintainers of the gates.

## Verifying locally

The examples are not pnpm workspace members, so a plain `pnpm install` at the repository root
ignores them. `examples:verify` builds the workspace, packs every package, copies each example to a
temp directory, pins every `@comvi/*` to a local tarball through `pnpm.overrides`, and runs
`pnpm install`, `pnpm build` and the example's own `typecheck` there. The committed `^0.5.0` ranges
are never rewritten.

```bash
pnpm examples:verify                               # all nine
pnpm examples:verify --only next                   # one
pnpm examples:verify --no-build --no-pack --keep   # re-run against the tarballs on disk
```

A green run says the source compiles under these manifests, not that `^0.5.0` is satisfiable;
only publishing settles that. Re-run the gate after the version bump.

| example      | typecheck        |
| ------------ | ---------------- |
| `react`      | `tsc`            |
| `vue`        | `vue-tsc`        |
| `svelte`     | `svelte-check`   |
| `solid`      | `tsc`            |
| `vanilla`    | `tsc`            |
| `next`       | `tsc`            |
| `nuxt`       | `nuxt typecheck` |
| `sveltekit`  | `svelte-check`   |
| `solidstart` | `tsc`            |

## How each example is composed

The setup is one file per example. `react` and `vanilla` are on the 0.8 API: `createI18n()` takes
the loader (`cdn()` from `@comvi/core/cdn` when the "Connect your Comvi project" variable is set,
the bundled catalogs otherwise) and the plugins (`detect()` and `persist()` from
`@comvi/core/plugins`, `devtools()` from `@comvi/core/devtools`) as options. Here is
`examples/react/src/i18n.ts` with its comments, the fetched-catalogs store and the missing-key
counter's plumbing elided:

```ts title="src/i18n.ts"
import { createI18n, type Loader } from "@comvi/react";
import { cdn } from "@comvi/core/cdn";
import { devtools } from "@comvi/core/devtools";
import { detect, persist } from "@comvi/core/plugins";

export const locales = ["en", "uk", "de", "ar"] as const;

const bundled = {
  en: () => import("./locales/en.json"),
  uk: () => import("./locales/uk.json"),
  de: () => import("./locales/de.json"),
  ar: () => import("./locales/ar.json"),
  "en:account": () => import("./locales/account/en.json"),
  "uk:account": () => import("./locales/account/uk.json"),
  "de:account": () => import("./locales/account/de.json"),
  "ar:account": () => import("./locales/account/ar.json"),
};

const fromBundle: Loader = async (locale, ns) => {
  const load = bundled[(ns === "default" ? locale : `${locale}:${ns}`) as keyof typeof bundled];
  if (!load) throw new Error(`No bundled catalog for ${locale}/${ns}`);
  return (await load()).default;
};

const cdnUrl: string | undefined = import.meta.env.VITE_COMVI_CDN_URL;
const loader = cdnUrl ? cdn(cdnUrl, { fallback: bundled }) : fromBundle;

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader,
  plugins: [detect({ supported: [...locales] }), persist(), devtools()],
  onError(error) {
    /* count distinct `${error.ns}:${error.key}` of `missing_key` for the Errors card */
  },
});
```

**Vanilla** composes the same instance from `@comvi/core` and its subpaths; plain `t()` parses
`<tag>…</tag>` itself (rich text is always on in 0.8).

The other examples are still on the 0.7 API until their binding moves to the 0.8 core (Vue lot 4,
Svelte and Solid lot 5, Next lot 6, Nuxt lot 7; `tooling/migration-pending.mjs` lists them): ICU
through the constructor's `compiler`, then `.use(loader({…}))` (or `cdnLoader`), then
`.use(localeDetector({…}))`. Of those:

- **Next** keeps the instance in `examples/next/src/i18n/config.ts` and the routing in a separate
  `routing.ts`, because `middleware.ts` runs in the Edge runtime and must not import the composed
  instance. `next.config.ts` points `withComvi({ config })` at the config module, the layout renders
  `<ComviProvider locale>` from `@comvi/next/server`, and the pages call `getI18n({ locale })`.
- **Nuxt** names a Comvi package in one file only, `examples/nuxt/src/comvi.i18n.ts`: a factory
  that composes `icuCompiler` and `loader(map)` on the options Nuxt resolved. `useI18n()`, `<T>`
  and `useSwitchLocalePath()` are auto-imported, and `src/app.vue` calls `useLocaleHead()`.

Neither SSR example composes a locale detector: the URL is the source of truth there, and the
framework middleware decides the locale before the instance runs.

Unset, which is the default and what StackBlitz runs, the import map is the only loader. Set, the
same import map becomes the CDN loader's `fallback`, so a CDN that cannot be reached still leaves
the app in its bundled language.

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

A namespace is loaded for the active locale and for the fallback chain, in the browser as on the
server. The en-only row therefore shows its English text whichever locale the page is first opened
in, in all seven gallery examples.

## Running the scenario in a browser

`examples:verify` proves the nine compile. `examples:e2e` opens them: it
installs and builds each example exactly as `examples:verify` does, starts the
built app the way a reader would (`vite preview`, `next start`, or Nitro's
`.output/server/index.mjs`, `node build`), and runs one Playwright spec against the seven
gallery examples through the same `data-testid`s (the two SSR recipes have their own, below). Every step but the About ones drives the feature gallery at
`/features` (`/<locale>/features` in `next` and `nuxt`), not the start page at `/`:

```bash
pnpm exec playwright install chromium   # once per machine
pnpm examples:e2e                       # all nine, bundled catalogs
pnpm examples:e2e --cdn                 # the seven gallery examples, catalogs from a mock CDN
pnpm examples:e2e --only react,next --no-build --no-pack --keep
```

The scenario relies on a few rows that exist mainly for the suite: a link to a **second page**
(`/about`, a real route in `next` and `nuxt`, a `history.pushState` view in the other five), a
**fallback** row (`fallback.only_en` is missing from `uk.json` on purpose, `fallback.nowhere` is in
no catalog), a **missing parameter** row (`t("greeting.hello", {})`), and `?name=…` in the address
overriding the greeting's parameter (`?name=<b>Grace</b>` must render as text, never as markup).
The catalogs also hold `ar`, a right-to-left locale.

The steps, each a column in the report. A step that cannot apply to an
example is `skip`, and the reason is printed under the table:

| step | asserts                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| a    | the first render is real text, and no catalog key appears anywhere in the page                                                   |
| b    | the switcher goes en → uk → de and the greeting follows                                                                          |
| c    | the counter at 0, 1, 2 and 5 renders the catalog's plural branch in en, uk and de                                                |
| d    | `<T>` renders `docs.read_more` with a real `<a href>` around the translated link text                                            |
| e    | the "catalogs fetched so far" line starts at `en` and grows by one per visited locale                                            |
| f    | next, nuxt: plain-HTTP `GET /uk` is already Ukrainian, and the hydrated page shows no key                                        |
| g    | no `console.error` and no uncaught exception during a full pass of its own                                                       |
| g2   | `--cdn`: g again in the dead-CDN build, past an allowlist of the refused-connection messages                                     |
| h    | the second page is translated, and the locale survives the link there, the link back and Back                                    |
| i    | next, nuxt: `/de` renders German, switching navigates to `/uk`, Back restores `/de`                                              |
| j    | uk's catalog is requested only when uk is chosen (a Nuxt `<link rel="prefetch">` hint is not a load)                             |
| k    | `--cdn`: the mock CDN served en, uk and de to this example, and nothing 404'd                                                    |
| k2   | `--cdn`: rebuilt against a CDN where nothing listens, the bundled `fallback` imports serve the catalogs                          |
| k3   | `--cdn`: the CDN's uk bundle lacks `fallback.only_en`, and the en value renders instead of the key                               |
| l    | the en value fills the key uk lacks; `fallback.nowhere` renders as itself                                                        |
| m    | reload keeps uk (and next, nuxt: `/` returns to `/uk`); a fresh `de-DE` browser starts in German                                 |
| n    | `<html lang>` follows the locale and `dir` becomes `rtl` for `ar`                                                                |
| o    | next, nuxt: from first paint through hydration the greeting is only ever the Ukrainian text                                      |
| p    | a missing parameter renders as its own placeholder, `{name}`                                                                     |
| q    | `?name=<img src=x onerror=…>` renders as text: no element is created and the handler never runs                                  |
| r    | every DOM state during en → uk → de is one whole language matching `<html lang>`, never a key                                    |
| s    | next, nuxt: a build with `defaultLocale: "uk"` serves `/uk` with the en value of an en-only key                                  |
| t    | `--cdn`, next, nuxt: `/uk` and `/de` rendered at once, both catalogs held, uk released first                                     |
| t2   | `--cdn`, next, nuxt: the same race, de released first                                                                            |
| u    | `--cdn`: en → uk → de with uk's catalog answered last (vue, nuxt queue switches; react, vanilla abort it); the page stays German |
| v    | `--cdn`: uk's catalog request hangs; after the loader's timeout the bundled uk renders                                           |
| v2   | `--cdn`: uk's catalog is corrupt JSON; the bundled uk renders                                                                    |
| w    | the first page never requests the `account` namespace; opening the second page loads it once                                     |
| x    | every DOM state of the second page during en → uk → de is one whole language, `account` rows included                            |
| y    | next, nuxt: plain-HTTP `GET /uk/about` carries the `account` text and hydrates without refetching it                             |
| z    | `--cdn`: in the dead-CDN build the bundled `locale:account` imports serve the namespace                                          |

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

### The mock CDN

`--cdn` starts a small server that serves `examples/locales` in the CDN layout,
every message prefixed with `[CDN] `, and builds every example with its "Connect
your Comvi project" variable pointing at it. The prefix is how the suite tells a text the
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

### DOM states

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

### The local registry

Every install resolves the whole `@comvi` scope from the tarballs under test:
`pnpm.overrides` pins each package, and the temp `.npmrc` points the scope at a
small local registry that serves only those tarballs. A peer no override
reaches (a `@comvi/core` that an example does not declare but a package it declares peers on)
therefore resolves to the same files and never to npm.

The run exits non-zero on any failure, and the failing assertion is printed
under the table.

## The SSR recipes

`sveltekit` and `solidstart` are the recipes on
[comvi.io/docs/i18n/ssr](https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart), not the feature
gallery, so they run [`ssr-recipe.spec.ts`](./ssr-recipe.spec.ts) and get a table of their own.
They read bundled catalogs only: `--cdn` leaves them out, and CI runs them in the default mode.
Each example is built three times from the same copy:

| build      | what it is                                                                                           | steps |
| ---------- | ---------------------------------------------------------------------------------------------------- | ----- |
| `recipe`   | the example as committed, served by `node build` or `node .output/server/index.mjs`                  | a–d   |
| `pressure` | 10 ms where a deployed app waits on the network: catalog loading, and data between switch and render | a2, e |
| `shared`   | `pressure` with one module-level instance rendering every request                                    | e2    |

| step | asserts                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| a    | plain-HTTP `/`, `/uk`, `/de`, `/ar`, `/about`, `/uk/about`: translated text, `<html lang dir>`, the en fallback row; JavaScript off still shows it |
| a2   | a, on `pressure`: with slow catalogs the text is in the HTML, not in a streamed `<template>`                                                       |
| b    | from first paint through hydration `/uk` is one state, then the plural counter answers a click                                                     |
| c    | after hydration, `/` → `/about` → `/` → `/uk` → `/uk/about` → `/ar/about` → `/ar` → `/de` → `/` and Back twice, none a page load                   |
| d    | `/xx`, `/xx/about`, `/en-US` and `/uk/xx` answer 404; `/about`, `/en`, `/en/about` are English                                                     |
| e    | on `pressure`, 100 concurrent requests across four locales each render their own                                                                   |
| e2   | `shared` renders each locale right alone, then the burst mixes them; without this, a green e could mean the burst never overlapped                 |
| f    | the example's own `typecheck`                                                                                                                      |

The variants are text edits of the temp copy, listed in `RECIPE_VARIANTS` in `lib.mjs`; an edit
that no longer matches exactly once fails the build instead of testing the wrong app. `pressure`
exists because, with bundled catalogs and nothing else to wait for, requests render one at a
time: a shared instance then comes out right too, and SolidStart without `deferStream` still has
the text in its first flush. Each step was seen red against a break of the recipe before it was
trusted: `<html lang>` left unwritten (a), `deferStream` removed (a2), the browser instance built
without the payload (b), the SvelteKit `$effect.pre` removed or the Solid `<Show>` not keyed (c),
the locale check removed from `load` or `matchFilters` (d), and the `shared` build for e.
