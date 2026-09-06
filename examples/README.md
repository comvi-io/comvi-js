# Comvi examples

Seven small apps — one page each — that demonstrate the same six things through
seven different bindings. Open one in the browser, switch the language, watch
the plural change.

| example                | binding                     | rendering            | typecheck        |
| ---------------------- | --------------------------- | -------------------- | ---------------- |
| [`react`](./react)     | `@comvi/react`              | client               | `tsc`            |
| [`vue`](./vue)         | `@comvi/vue`                | client               | `vue-tsc`        |
| [`svelte`](./svelte)   | `@comvi/svelte`             | client               | `svelte-check`   |
| [`solid`](./solid)     | `@comvi/solid`              | client               | `tsc`            |
| [`vanilla`](./vanilla) | `@comvi/core`, no framework | client               | `tsc`            |
| [`next`](./next)       | `@comvi/next`               | server, then hydrate | `tsc`            |
| [`nuxt`](./nuxt)       | `@comvi/nuxt`               | server, then hydrate | `nuxt typecheck` |

The last two are the ones where the **URL carries the locale**: `/en`, `/uk` and
`/de` are three real addresses you can link and bookmark, the switcher navigates
rather than mutating a ref, and the page that comes back over the wire is
already in the right language. The other five hold the locale in memory.

## Open one in StackBlitz

Every example installs from npm and starts with one command, so StackBlitz can
run it straight out of the GitHub tree — there is no separate hosting and no
deploy step; the demos travel with the repository:

```
https://stackblitz.com/github/comvi-io/comvi-js/tree/<branch>/examples/<framework>
```

for example
<https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/react>.
The docs site puts an "Open in StackBlitz" button on that URL for each
framework page.

**These examples install from npm.** They depend on the published names
(`"@comvi/react": "^0.5.0"`), never on `workspace:*` — a workspace protocol
range is exactly what makes `test-apps/*` unopenable in a WebContainer. The
consequence is that a StackBlitz link works once the version it asks for is
published. During a release candidate, point the branch at the `next` tag:

```bash
pnpm examples:use-tag next      # "@comvi/react": "next"
pnpm examples:use-tag ^0.5.0    # back to the release range
pnpm examples:use-tag --print   # what each example asks for right now
```

## What each example shows

The same scenario everywhere, in the same order down the page:

1. **A locale switcher** — `en` / `uk` / `de`.
2. **A string with a parameter** — `greeting.hello`, `{name}`.
3. **A plural** — `cart.items`, an ICU `plural` on a live counter.
4. **`<T>` with a tag** — `docs.read_more` holds `<link>…</link>`; the app
   decides that `<link>` is an `<a href>`. (The vanilla example does the same
   through the string API and a tag handler, since there is no `<T>` without a
   framework.)
5. **Date and number formatting** — `stats.summary` interpolates a formatted
   number and a formatted date.
6. **A lazy loader** — each catalog is a dynamic `import()`, so a locale's JSON
   is fetched the first time you select it. The last line lists the catalogs
   fetched so far; it starts with one entry and grows as you switch. (`next` and
   `nuxt` read that line after mount rather than during the server render — see
   below.)

The whole setup is one file per example, and the composition is the same
everywhere: ICU through the constructor's `compiler`, then `.with(loader({…}))`,
then `.with(plugins())`, then `.use(LocaleDetector(…))`. Here is
`examples/react/src/i18n.ts`, which `solid` and `svelte` match line for line
apart from the import specifier:

```ts title="src/i18n.ts"
import { createI18n, icuCompiler, loader, plugins } from "@comvi/react";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
})
  .with(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
    }),
  )
  .with(plugins())
  .use(LocaleDetector({ supportedLocales: ["en", "uk", "de"], fallbackLocale: "en" }));
```

Four of the seven depart from that file, and every departure is the binding
telling you something true about itself:

**Vue** — installers run on the HOST, and `createI18n` from `@comvi/vue` is not
a rename of core's: it constructs a core for you and wraps it in a `VueI18n`
reactivity layer. So compose first and wrap afterwards. Piping onto the wrapper
instead — `createI18n(options).core.with(loader())` — does attach the capability
at runtime, but `createI18n` returns `VueI18n<D, I18n<D>>` and the wrapper never
re-types `.core`, so every later `i18n.core.registerLoader(…)` is a compile
error. `createI18nFromCore` preserves the composed host's exact type, which is
the whole reason this file is shaped differently (`packages/vue/README.md`,
"Supported hosts and what they cost").

```ts title="src/i18n.ts"
import { createCore, createI18nFromCore, icuCompiler, loader, plugins } from "@comvi/vue";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const core = createCore({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
})
  .with(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
    }),
  )
  .with(plugins())
  .use(LocaleDetector({ supportedLocales: ["en", "uk", "de"], fallbackLocale: "en" }));

export const i18n = createI18nFromCore(core);
```

**Vanilla** — there is no binding to re-export the toolkit, so every capability
arrives by its own subpath: `@comvi/core/icu`, `@comvi/core/loader`,
`@comvi/core/plugins`. It also side-effect-imports `@comvi/core/tags`, which the
other four must not: that import registers tag syntax _ambiently_, so plain
`t()` starts parsing `<tag>…</tag>` everywhere. The framework examples get tags
through `<T>`, which passes the grammar per call and leaves `t()` alone; without
a `<T>`, the vanilla example has to opt in by name.

**Next** — nothing here composes anything, and that is the point.
`createNextI18n` is the batteries-included preset: it composes ICU, the tag
grammar, the loader and the plugin host **inside the package**, so
`examples/next/src/i18n/config.ts` names no installer at all. What it names
instead is the URL, because `createNextI18n` returns the host **and** the
routing config from one call and they cannot drift apart:

```ts title="src/i18n/config.ts" check=group=examples-next
import { createNextI18n } from "@comvi/next";

export const nextI18n = createNextI18n({
  locales: ["en", "uk", "de"],
  defaultLocale: "en",
  localePrefix: "always",
  fallbackLocale: "en",
});

export const { i18n, routing } = nextI18n;
```

Five more files carry that through, and each one is doing a job the client-only
examples never have: `src/i18n/server.ts` is a `server-only` module whose import
runs `setI18n(i18n)` before any Server Component asks for a translation;
`src/middleware.ts` is `createMiddleware(routing)` and nothing else;
`app/[locale]/ComviProvider.tsx` is `"use client"` because Next cannot serialize
a class instance across the hydration boundary, so the host is imported on the
client side and the server hands over only a locale and a catalog; the layout
calls `setRequestLocale(locale)` and `loadTranslations(locale)` and passes both
to that provider; and the page reads `getI18n()`, which is exactly `t` and
`hasTranslation` bound once to this request.

`<T>` is in `Demo.tsx` and the six rows are a client component — five of them
are interactive — but they still render on the SERVER for the first paint,
because `<I18nProvider messages>` seeds the catalog before its children run.
`curl -s http://localhost:3000/uk` on the built app returns HTML that already
contains `2 товари у кошику`, and `<html lang="uk" dir="ltr">`; `dir` comes from
core's free `getTextDirection(locale)` rather than from `useI18n()`, because a
Server Component has no hooks.

**Nuxt** — the module builds the host for you, and the host it builds is the
**base** one: no ICU, no loader, no plugins. `comvi.hostModule` is the only way
to change that, so `examples/nuxt/src/comvi.host.ts` is the one file in the app
that names a comvi package at all — `useI18n()`, `<T>` and `useSwitchLocalePath()`
are auto-imported, and nothing under `pages/` writes an import:

```ts title="comvi.host.ts" check=group=examples-nuxt
import { createI18n, type I18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader, type I18nLoaderApi } from "@comvi/core/loader";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).with(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
      de: () => import("./locales/de.json"),
    }),
  )) satisfies NuxtHostFactory<I18n & I18nLoaderApi>;
```

It is a **factory**, not a host: it runs once for the client plugin and once per
server request, and it receives Nuxt's resolved `comvi` options, so
`nuxt.config.ts` stays in charge of configuration while this file stays in
charge of capabilities. That is also why `@comvi/core` is a direct dependency
here — the installers come from its subpaths, and a transitive dependency is not
resolvable under pnpm's default layout.

Two things about it are easy to get wrong and are both visible in the app.
`comvi.cdnUrl` and `comvi.apiBaseUrl` **load nothing** in 0.5 — they are copied
into public runtime config and read by no code in the module — so SSR loading is
the loader capability above, and this example sets neither. And the module never
touches `<html>`: `src/app.vue` calls `useLocaleHead({ addLang: true, addDir:
true })`, without which the page renders correctly and ships no `lang`
attribute at all. `dir` needs one more thing — `useLocaleHead` writes it only
for a locale that **declares** one, so all three locale objects in
`nuxt.config.ts` say `dir: "ltr"`. An RTL language would say `"rtl"` there and
nothing else in the app would change.

**What the two SSR examples deliberately leave out.** Neither declares
`@comvi/plugin-locale-detector`, which the other five all use. In both
frameworks the locale is decided before the host ever runs — Next's middleware
reads the path, then the `NEXT_LOCALE` cookie, then `Accept-Language`; Nuxt's
route middleware and `detectBrowserLanguage` do the same — and a detector
running inside `init()` on the client would then switch the locale away from the
one the URL asked for and the server already rendered. The URL is the source of
truth in these two, so detection belongs to the router, not to a plugin.

They also read the "catalogs fetched so far" line **after mount** rather than
during the server render. In Next the host is one module-scope instance shared
by every concurrent request, so its loaded-catalog set is a fact about the
process; in Nuxt the server host is per-request and the browser's is a different
object again. Either way the number the server would print is not the number the
browser has, and rendering it during SSR would be a hydration mismatch dressed
up as a demo.

Three details are worth reading in the source rather than taking on trust:

- **Composition is explicit.** A capability is absent because its module never
  entered the bundle, so ICU, loading and plugins are each named at the point
  they are added: `compiler: icuCompiler` in the constructor options,
  `.with(loader({…}))`, `.with(plugins())`. `loader(map)` attaches the
  capability _and_ registers the import-map adapter; `registerLoader` on its own
  takes a plain function. `.use()` lives on the plugin capability, not on the
  base host.
- **ICU is opt-in.** Without `compiler: icuCompiler` the plural line in the
  catalog is not syntax — the simple compiler renders the braced segment
  literally.
- **Formatting.** The bindings expose `formatNumber` / `formatDate` / `dir`
  bound to the render-time locale (`useI18n()`); the vanilla example — and the
  Next layout, which is a Server Component and so has no hooks — uses the free
  functions from `@comvi/core`, which take the host as their first argument:
  `formatNumber(i18n, 1234567)`, `getTextDirection(locale)`. There is no
  `i18n.formatCurrency` and no `i18n.dir` on a core instance.

## The catalogs

`examples/locales/{en,uk,de}.json` is the single source. StackBlitz opens one
directory out of the tree, so an example can only import files that live inside
its own folder — the catalogs are therefore **copied** into
`examples/<framework>/src/locales/`, not symlinked. That path is why the Next
example keeps its App Router under `src/app` and the Nuxt one sets
`srcDir: "src/"`: the copy target is the same for all seven, and the script
discovers them by looking for a `package.json`, so a new example needs no entry
anywhere. Edit the shared copy, then:

```bash
pnpm examples:sync-locales           # re-copy into all seven
node scripts/examples-sync-locales.mjs --check   # fail if a copy drifted
```

## Verifying locally

The examples are not pnpm workspace members (`pnpm-workspace.yaml` covers
`apps/*`, `packages/*`, `test-apps/*`, `tooling/*` — not `examples/*`), so a
plain `pnpm install` at the repository root ignores them, and before 0.5.0 is on
npm nothing else would ever compile them. That is what `examples:verify` is for:

```bash
pnpm examples:verify                 # all seven
pnpm examples:verify --only next     # one
pnpm examples:verify --no-build --no-pack --keep   # re-run against the tarballs on disk
```

It builds the workspace, packs all fourteen packages, copies each example to a
temp directory outside every workspace, pins every `@comvi/*` — direct **and
transitive** — to a local tarball through `pnpm.overrides`, and then runs
`pnpm install`, `pnpm build` and the example's own `typecheck` there. The
committed `^0.5.0` ranges are never rewritten: an override redirects resolution
without touching the declaration, so the manifest that ships to StackBlitz is
the manifest that was verified.

The one thing that is **not** the same for all seven is the size probe. Each
example is classified by the CLI its own `build` script runs — `vite`, `next` or
`nuxt` — and the report's "first load" columns mean something slightly different
per kind, because the three build tools do not put the entry chunk in the same
place and Next's first load is not one file at all:

| kind   | what is measured                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `vite` | the entry chunk `dist/index.html` names                                                                                        |
| `next` | the route's chunk list from `.next/app-build-manifest.json`, page plus enclosing layouts — the build summary's "First Load JS" |
| `nuxt` | the `isEntry` chunk of the Vite client manifest, in `.output/public/_nuxt`                                                     |

In all three the entry is **named by the build**, never picked by size: the lazy
locale catalogs are separate chunks by design, and a "largest file" rule would
keep working right up until the split regressed. A build output none of the
three probes can read is an error, not a blank cell — a missing size must never
read as a small one. Adding an eighth example on a fourth framework therefore
means adding a kind and a probe, which is deliberate.

The overrides matter. `pnpm pack` rewrites `workspace:*` to a concrete version,
so a locally packed `@comvi/react` asks the **registry** for `@comvi/core` —
install that one tarball and the example builds green against the previous
release. After the install the script refuses to continue unless the lockfile
says every `@comvi` resolution came from a local `file:` tarball.

**What this gate does not prove.** An override bypasses the range it replaces,
so a green run says the 0.5 _source_ compiles under these manifests — never that
`^0.5.0` is satisfiable. Only publishing settles that. The install is run with
`auto-install-peers=false` and `strict-peer-dependencies=true`, which makes an
unmet peer _range_ fail the install the way `npm install` would rather than being
quietly auto-installed. It does not make a **missing** `@comvi` peer visible —
the override satisfies that one — which is why the undeclared `@comvi/core` peer
was caught by the provenance assertion instead. Re-run the gate after the
version bump: that is the moment the detector's peer range and the examples'
`^0.5.0` meet for the first time.

No lockfile in this repository is read or written by any of this.
