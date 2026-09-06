# Comvi examples

Five small apps — one page each — that demonstrate the same six things through
five different bindings. Open one in the browser, switch the language, watch the
plural change.

| example                | binding                     | typecheck      |
| ---------------------- | --------------------------- | -------------- |
| [`react`](./react)     | `@comvi/react`              | `tsc`          |
| [`vue`](./vue)         | `@comvi/vue`                | `vue-tsc`      |
| [`svelte`](./svelte)   | `@comvi/svelte`             | `svelte-check` |
| [`solid`](./solid)     | `@comvi/solid`              | `tsc`          |
| [`vanilla`](./vanilla) | `@comvi/core`, no framework | `tsc`          |

## Open one in StackBlitz

Every example is a plain Vite app, so StackBlitz can run it straight out of the
GitHub tree — there is no separate hosting and no deploy step; the demos travel
with the repository:

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
   fetched so far; it starts with one entry and grows as you switch.

The whole setup is one file per example. Here is `examples/react/src/i18n.ts`,
which the other four differ from only in the import specifier:

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
  bound to the render-time locale (`useI18n()`); the vanilla example uses the
  free functions from `@comvi/core`, which take the host as their first
  argument: `formatNumber(i18n, 1234567)`, `getTextDirection(locale)`. There is
  no `i18n.formatCurrency` and no `i18n.dir` on a core instance.

## The catalogs

`examples/locales/{en,uk,de}.json` is the single source. StackBlitz opens one
directory out of the tree, so an example can only import files that live inside
its own folder — the catalogs are therefore **copied** into
`examples/<framework>/src/locales/`, not symlinked. Edit the shared copy, then:

```bash
pnpm examples:sync-locales           # re-copy into all five
node scripts/examples-sync-locales.mjs --check   # fail if a copy drifted
```

## Verifying locally

The examples are not pnpm workspace members (`pnpm-workspace.yaml` covers
`apps/*`, `packages/*`, `test-apps/*`, `tooling/*` — not `examples/*`), so a
plain `pnpm install` at the repository root ignores them, and before 0.5.0 is on
npm nothing else would ever compile them. That is what `examples:verify` is for:

```bash
pnpm examples:verify                 # all five
pnpm examples:verify --only react    # one
pnpm examples:verify --no-build --no-pack --keep   # re-run against the tarballs on disk
```

It builds the workspace, packs all fourteen packages, copies each example to a
temp directory outside every workspace, pins every `@comvi/*` — direct **and
transitive** — to a local tarball through `pnpm.overrides`, and then runs
`pnpm install`, `pnpm build` and the example's own `typecheck` there. The
committed `^0.5.0` ranges are never rewritten: an override redirects resolution
without touching the declaration, so the manifest that ships to StackBlitz is
the manifest that was verified.

The overrides matter. `pnpm pack` rewrites `workspace:*` to a concrete version,
so a locally packed `@comvi/react` asks the **registry** for `@comvi/core` —
install that one tarball and the example builds green against the previous
release. After the install the script refuses to continue unless the lockfile
says every `@comvi` resolution came from a local `file:` tarball.

No lockfile in this repository is read or written by any of this.
