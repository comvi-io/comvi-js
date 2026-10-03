# Comvi examples

Seven small apps, one page each, that demonstrate the same six things through seven different
bindings. Open one in the browser, switch the language, and watch the plural change.

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
2. **A string with a parameter:** `greeting.hello`, `{name}`.
3. **A plural:** `cart.items`, an ICU `plural` on a live counter.
4. **`<T>` with a tag:** `docs.read_more` holds `<link>…</link>`; the app decides that `<link>` is
   an `<a href>`. The vanilla example does the same through the string API and a tag handler.
5. **Date and number formatting:** `stats.summary` interpolates a formatted number and a formatted
   date.
6. **A lazy loader:** each catalog is a dynamic `import()`, so a locale's JSON is fetched the first
   time you select it.

The setup is one file per example. In `react`, `vue`, `svelte` and `solid` that file is the same
composition apart from the import specifier: ICU through the constructor's `compiler`, then
`.use(loader({…}))`, then `.use(localeDetector({…}))`. Here is `examples/react/src/i18n.ts` with
its comments elided:

```ts title="src/i18n.ts"
import { createI18n, icuCompiler, loader } from "@comvi/react";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const locales = ["en", "uk", "de"] as const;

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
    }),
  )
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
  host. A `server-only` module registers the host, the layout calls `setRequestLocale()` and
  `loadTranslations()`, and a `"use client"` provider receives the locale and the catalog.
- **Nuxt** names a Comvi package in one file only, `examples/nuxt/src/comvi.host.ts`: a factory
  that composes `icuCompiler` and `loader(map)` on the options Nuxt resolved. `useI18n()`, `<T>`
  and `useSwitchLocalePath()` are auto-imported, and `src/app.vue` calls `useLocaleHead()`.

Neither SSR example composes a locale detector: the URL is the source of truth there, and the
framework middleware decides the locale before the host runs.

## The catalogs

`examples/locales/{en,uk,de}.json` is the single source. StackBlitz opens one directory out of the
tree, so the catalogs are copied into `examples/<framework>/src/locales/` rather than symlinked.
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
