# Comvi examples

Seven small apps, one per framework, that show what the Comvi i18n library does: switch between
English, Ukrainian, German and Arabic and watch plurals, dates, markup, lazy loading and
right-to-left layout follow. Every one of the seven renders the same showcase page, one card per
feature, from the same catalogs in [`locales`](./locales). Two more, [`sveltekit`](./sveltekit)
and [`solidstart`](./solidstart), are the [server-rendering recipes](https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart)
from the docs as apps. The pages you run here are the pages our end-to-end suite runs, so what you
see in the browser is what the release was tested on.

## The seven

| example                | binding                     | routing and rendering                                     | open                                                                                     |
| ---------------------- | --------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`react`](./react)     | `@comvi/react`              | client, React Router, locale in memory                    | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/react)   |
| [`vue`](./vue)         | `@comvi/vue`                | client, Vue Router, locale in memory                      | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vue)     |
| [`svelte`](./svelte)   | `@comvi/svelte`             | client, History API, locale in memory                     | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/svelte)  |
| [`solid`](./solid)     | `@comvi/solid`              | client, Solid Router, locale in memory                    | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/solid)   |
| [`vanilla`](./vanilla) | `@comvi/core`, no framework | client, History API, locale in memory                     | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vanilla) |
| [`next`](./next)       | `@comvi/next`               | server-rendered, then hydrated; locale in the URL (`/uk`) | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/next)    |
| [`nuxt`](./nuxt)       | `@comvi/nuxt`               | server-rendered, then hydrated; locale in the URL (`/uk`) | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/nuxt)    |

In `next` and `nuxt`, `/en`, `/uk` and `/de` are three real addresses: the switcher navigates, and
the HTML that comes back over the wire is already in that language.

## What every example shows

Each card on the page is one feature, in the same order in all seven:

- **Parameters:** `t("greeting.hello", { name })`, and a parameter always renders as text, never
  as markup.
- **ICU plurals** on a live counter, with each language's own plural rules.
- **Ordinals:** `selectordinal` knows that English says 1st, 2nd, 3rd and Ukrainian does not.
- **Select:** one message branching on a value such as a gender.
- **Markup inside a translation:** `<link>…</link>` in the catalog, and the app decides that it
  renders as an `<a href>`.
- **Dates, numbers and currency** formatted for the active locale.
- **Lazy loading** of catalogs and of namespaces: a language is fetched the first time it is
  picked, and the `account` namespace the first time its page opens. Watch the network panel.
- **Call options:** `locale` per call, so language names render in their own language, and a list
  of only the catalogs loaded so far.
- **Fallback and a missing key:** a key missing from `uk` shows its English value; a key in no
  catalog renders as itself.
- **A missing parameter** renders as its own placeholder, `{name}`.
- **The `onMissingKey` hook**, wired to a counter of distinct missing keys you could send to your
  tracker.
- **A second page**, Account, that loads the `account` namespace and keeps the chosen language on
  the way there and back.
- **Right-to-left:** pick Arabic in the switcher and the page turns RTL through the library's
  `dir`.

Each example has its own README with the file where the setup lives.

## The SSR recipes

| example                      | binding         | routing and rendering                                               |
| ---------------------------- | --------------- | ------------------------------------------------------------------- |
| [`sveltekit`](./sveltekit)   | `@comvi/svelte` | server-rendered, then hydrated; `/` is English, `/uk`, `/de`, `/ar` |
| [`solidstart`](./solidstart) | `@comvi/solid`  | server-rendered, then hydrated; `/` is English, `/uk`, `/de`, `/ar` |

Neither binding ships a server integration for its framework, so these two show the wiring the
docs describe: an instance per request on the server, the catalogs handed to the browser as data,
and a browser instance that follows the URL on client navigation. Two pages, with a greeting, a
plural counter, `<T>` and an English fallback, and no feature gallery. They read
their bundled catalogs only, so the "Connect your Comvi project" variables below do not apply;
each README says where `cdnLoader` goes instead.

## How an example is wired

Every gallery example composes one instance the same way, in its `src/i18n.ts` (Next: `src/i18n/config.ts`, Nuxt: `src/comvi.i18n.ts`): the base instance from the binding, a loader with one import per catalog, the locale detector, and `devtools()`, which makes the instance visible to the Comvi browser extension and lets it load the in-context editor. React's, with the counter plumbing left out:

```ts title="src/i18n.ts"
import { createI18n, devtools, icuCompiler, loader } from "@comvi/react";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
})
  .use(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
      ar: () => import("./locales/ar.json"),
      "en:account": () => import("./locales/account/en.json"),
    }),
  )
  .use(
    localeDetector({
      supportedLocales: ["en", "uk", "de", "ar"],
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
      fallbackLocale: "en",
    }),
  )
  .use(devtools());
```

## Run locally

Every example installs from npm and starts with one command:

```sh
cd examples/react
npm install
npm run dev
```

The examples depend on the published names (`"@comvi/react": "^0.7.0"`), never on `workspace:*`,
so a StackBlitz link works once the version it asks for is published. During a release candidate,
point the manifests at the `next` tag:

```sh
pnpm examples:use-tag next      # "@comvi/react": "next"
pnpm examples:use-tag ^0.7.0    # back to the release range
pnpm examples:use-tag --print   # what each example asks for right now
```

## Connect your Comvi project

The catalogs in each example's `src/locales` are bundled with the app. Set one variable before you
build or start the dev server, and the example reads its translations from your Comvi project's CDN
instead, keeping the bundled catalogs as the fallback when the CDN cannot be reached:

| example                            | variable                                                   |
| ---------------------------------- | ---------------------------------------------------------- |
| react, vue, svelte, solid, vanilla | `VITE_COMVI_CDN_URL` (build time)                          |
| next                               | `NEXT_PUBLIC_COMVI_CDN_URL` (build time)                   |
| nuxt                               | `NUXT_PUBLIC_COMVI_CDN_URL` (runtime config `comviCdnUrl`) |

```sh
VITE_COMVI_CDN_URL=https://cdn.comvi.io/<your-project> npm run dev
```

The CDN serves `{cdnUrl}/{locale}.json` for the default namespace and
`{cdnUrl}/{namespace}/{locale}.json` for the rest.

## The catalogs

[`locales`](./locales) is the single source: `{en,uk,de,ar}.json` are the default namespace and
`account/{en,uk,de,ar}.json` is the `account` namespace, the layout the CDN serves. StackBlitz opens
one directory out of the tree, so the catalogs are copied into `examples/<framework>/src/locales/`
rather than symlinked. Edit the shared copy, then:

```sh
pnpm examples:sync-locales                        # re-copy into every example
node scripts/examples-sync-locales.mjs --check    # fail if a copy drifted
```

## Maintainers

The build-and-typecheck gate and the Playwright suites that run these nine are documented in
[`scripts/examples-e2e/README.md`](../scripts/examples-e2e/README.md).
