<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-dark.svg">
    <img alt="Comvi" src="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-light.svg" width="860">
  </picture>
</p>

<h1 align="center">Modern i18n for JavaScript & TypeScript</h1>

<p align="center">
  One framework-agnostic core. ICU MessageFormat and rich text without XSS —<br/>
  for <b>React</b>, <b>Next.js</b>, <b>Vue</b>, <b>Nuxt</b>, <b>Svelte</b>, and <b>SolidJS</b>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue&label=npm" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/@comvi/core"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/core?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml"><img src="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://comvi.io"><img src="https://img.shields.io/badge/Platform-comvi.io-7c3aed" alt="Comvi Platform"></a>
</p>

<p align="center">
  <a href="https://x.com/Comvi_io"><img src="https://img.shields.io/twitter/follow/Comvi_io?style=social&logo=x" alt="Follow on X"></a>
  <a href="https://www.linkedin.com/company/comvi-io/"><img src="https://img.shields.io/badge/LinkedIn-Comvi-0A66C2?logo=linkedin&logoColor=white" alt="Comvi on LinkedIn"></a>
</p>

<p align="center">
  <b><a href="https://comvi.io/docs/i18n/quick-start">Documentation</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io">Comvi Platform</a></b>
</p>

---

## What this is

An i18n library for JavaScript and TypeScript apps: you write `t("greeting", { name })`, it renders
the right string for the active locale. One core, six framework bindings, ICU MessageFormat, rich
text that embeds components into a sentence without raw HTML, and typed translation keys. It works
standalone with catalogs you ship in your bundle, and pairs with [Comvi](https://comvi.io), a
translation management platform that serves catalogs from a CDN so you can ship a translation
without a redeploy.

## Install

One install is enough for the host, the bindings and the capability toolkit: each framework package
bundles `@comvi/core` and re-exports what you compose with.

```bash
npm install @comvi/react     # Peer: react ^18 || ^19
npm install @comvi/next      # Peers: next ^14 || ^15, react ^18 || ^19
npm install @comvi/vue       # Peer: vue ^3
npm install @comvi/nuxt      # Peer: nuxt ^3 || ^4
npm install @comvi/svelte    # Peer: svelte ^5.3
npm install @comvi/solid     # Peer: solid-js ^1.8
npm install @comvi/core      # Vanilla / Node
```

The exception is the free formatting functions — `formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`. No binding re-exports those, so a component that calls one
directly imports it from `@comvi/core` and must declare `@comvi/core` in its own dependencies;
pnpm's strict layout will not resolve it transitively. `useI18n()` hands back bound formatters,
which need no extra import.

Node 20 or newer for the runtime packages above; `@comvi/cli` and `@comvi/vite-plugin` need Node 22.
Loading translations from the Comvi platform adds one package beside the framework one —
`npm install @comvi/plugin-fetch-loader`, which is step 2 below.

## Quick start

Two steps, and the second is additive. Every framework README tells the same two-step story in its
own idiom: [react](packages/react) · [next](packages/next) · [vue](packages/vue) ·
[nuxt](packages/nuxt) · [svelte](packages/svelte) · [solid](packages/solid) ·
[core / vanilla](packages/core). React is the example here.

### Step 1 — an inline catalog

Scaffold a React app and add one package:

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app && npm install
npm install @comvi/react
```

The starter is not optional. It supplies the bundler, the `index.html` that `#root` lives in, the
`tsconfig.json` (these snippets need `jsx: "react-jsx"` and `moduleResolution: "bundler"`) and React
itself — `@comvi/react` peer-depends on `react` only, not `react-dom`.

Five things to know. `createI18n` builds **the host**: the object it returns, holding the catalog,
the current locale and `t()`. `locale` is what renders now, `fallbackLocale` covers a missing key,
`translation` is the catalog, and `<I18nProvider>` puts the host where the `useI18n()` hook can find
it. Runnable: [`examples/react`](examples/react).

```tsx title="src/main.tsx" check=group=readme-step-1
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
);
```

Any component under the provider reads the host with `useI18n()`. The member names are the same in
all six bindings.

```tsx title="src/App.tsx" check=group=readme-step-1
import { useI18n } from "@comvi/react";

export default function App() {
  const { t, locale, setLocale } = useI18n();

  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

`npm run dev`, then open the URL it prints: the heading reads `Hello, Alice!`, and choosing
**Українська** in the select changes it to `Привіт, Alice!` without a reload. There is no
`i18n.init()` call — `<I18nProvider>` initializes the host itself (`autoInit`, on by default).

### Step 2 — connect to Comvi

Three questions, and the answers are the lines below. Every framework README asks them in this
same order; only the third answer differs, except on next, where step 1 already answered the first.

1. **Which parser?** `compiler: icuCompiler`. The platform's catalogs use ICU plurals, and the
   default `{param}` compiler does not render them. Without `compiler: icuCompiler`, an ICU message
   (`{count, plural, …}`) fails in development at ingestion, before anything renders. Inline, it
   throws `E_ICU_SYNTAX` at the call that carries the catalog; over a loader it fails that
   namespace's load instead — `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and
   `init()` rejects with `[i18n] Failed to load all namespaces …`, not with `E_ICU_SYNTAX`, when
   that was the only namespace. In production it renders the message text literally and reports the
   error through `onError` (`console.error` when no handler is set).
2. **Where from?** `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn`, which
   fetches the catalog at runtime instead of bundling it.
3. **What to paint meanwhile?** A **`fallback`** on `<I18nProvider>`. The catalog is in flight
   during the first paint now, and the provider gates its children until the host is initialized.
   Vue and Svelte have no `fallback` prop and gate on `isInitializing` instead; core, next and nuxt
   need no gate at all.

```tsx title="src/main.tsx" check=group=readme-step-2
import { createRoot } from "react-dom/client";
import { createI18n, icuCompiler, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }));

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} fallback={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

That is step 1's `src/main.tsx` with the catalog swapped for the loader and one prop added to the
provider; `src/App.tsx` does not change.

`cdnUrl` is the whole URL the platform hands you: open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved).

Chain `.use(…)` before `init()`; doing it afterwards warns once in development. ICU is not chained
at all — it is the constructor option above. Full rules:
[docs/design/composition.md](docs/design/composition.md).

## What is portable across frameworks

Portable, identically, in all six bindings: **`useI18n()`** and the member names it returns (`t`,
`tRaw`, `locale`, `setLocale`, `isLoading`, `isInitializing`, `isInitialized`, `cacheRevision`);
**`t()`** and its one call signature, including `useI18n("admin")` binding a namespace at the type
level; **typed keys**, where one `TranslationKeys` augmentation serves every binding; **ICU**
syntax and behaviour through the same `compiler: icuCompiler` option; and **capability
acquisition** with `useI18nLoader()` and `useI18nPlugins()`.

Not portable, by design: **`<T>` follows each framework's own idiom** for its `components` map —
react takes elements to clone, vue named slots, solid functions, svelte tag names or
`{ tag, props }` configs. **SSR rules differ too**, and one inverts: Next requires a module-scope
host, while Solid, Svelte, Vue and Nuxt each forbid one ([ssr.md](docs/design/ssr.md)). So does
`Intl`-formatter reactivity: React and Vue re-render on a locale change, Svelte and Solid do not
([formatting.md](docs/design/formatting.md)).

## Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key,
generated by [`@comvi/cli`](packages/cli) from the platform or
[`@comvi/vite-plugin`](packages/vite-plugin) from local JSON. The declaration to write, the
generated shape and what TypeScript catches are on
[typed keys](https://comvi.io/docs/i18n/type-safety).

## Reading the type errors

Six diagnostics cover almost every first run against 0.5, each quoted exactly as `tsc` or node
prints it, on [reading the type errors](https://comvi.io/docs/i18n/reading-type-errors). `t()` has
ONE call signature, so TypeScript names the actual problem on the first line rather than listing
three overloads and burying it.

## What it weighs

Measured min+gz through each package's published entry with a framework's own runtime left out, and
re-measured in CI against [`scripts/size-budgets.json`](scripts/size-budgets.json) by the rule in
[`scripts/size-budgets.md`](scripts/size-budgets.md). Every fixture and its figure:
[bundle size](https://comvi.io/docs/i18n/bundle-size).

Against the last published release, measured on 2026-09-06 with the same harness on both sides (tag
`v0.4.1`, a monolith with one entry; "minimal app" is identical source on both sides, "everything"
is `import * as everything` on 0.4.1 against the full composite on 0.5):

| app shape                     | 0.4.1                    | 0.5                     | change            |
| ----------------------------- | ------------------------ | ----------------------- | ----------------- |
| core, minimal app             | 8 429 B                  | 5 093 B                 | −40 %             |
| react, minimal app            | 10 858 B                 | 6 714 B                 | −38 %             |
| vue / solid / svelte, minimal | 11 094 / 9 923 / 9 871 B | 7 041 / 6 413 / 6 518 B | −37 / −35 / −34 % |
| every capability composed     | 9 015 … 11 217 B         | 8 785 … 11 653 B        | −2.6 … +4.0 %     |

The minimal app lost a third of its weight; the ceiling did not move, while 0.5 composes things 0.4
did not have (devtools discovery, the tag-handler boundary, the editor contract).

Every capability is an import you add, so an app carries only what it composes. No `eval` and no
`new Function` in any runtime package, so everything runs under a strict CSP without `unsafe-eval`.
`@comvi/core` has zero runtime dependencies.

## Packages

### Frameworks

| Package                            | Description                                           | Docs                                    |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| [`@comvi/react`](packages/react)   | `<I18nProvider>`, `useI18n()` hook, `<T>` component   | [→](https://comvi.io/docs/i18n/react)   |
| [`@comvi/next`](packages/next)     | Next.js App Router: SSR, middleware, locale routing   | [→](https://comvi.io/docs/i18n/next)    |
| [`@comvi/vue`](packages/vue)       | Vue 3 plugin, `useI18n()`, `<T>` component            | [→](https://comvi.io/docs/i18n/vue)     |
| [`@comvi/nuxt`](packages/nuxt)     | Nuxt 3 / 4 module: auto-imports, SSR, locale routing  | [→](https://comvi.io/docs/i18n/nuxt)    |
| [`@comvi/svelte`](packages/svelte) | Svelte stores + context (Svelte 5) + `<T>` component  | [→](https://comvi.io/docs/i18n/svelte)  |
| [`@comvi/solid`](packages/solid)   | SolidJS provider + reactive signals + `<T>` component | [→](https://comvi.io/docs/i18n/solid)   |
| [`@comvi/core`](packages/core)     | Framework-agnostic runtime, ICU parser, plugin system | [→](https://comvi.io/docs/i18n/vanilla) |

### Plugins and tooling

| Package                                                                | Description                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader)           | Load translations from the Comvi CDN or API               |
| [`@comvi/plugin-locale-detector`](packages/plugin-locale-detector)     | Detect the locale from query, cookie, storage, browser    |
| [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor) | Visual in-app translation editor (requires Comvi account) |
| [`@comvi/vite-plugin`](packages/vite-plugin)                           | Generate types from local JSON files at dev/build time    |
| [`@comvi/cli`](packages/cli)                                           | Generate types from the Comvi TMS, sync translations      |

Two workspace packages, `locale-routing` and `typegen`, are `"private": true`: they publish no npm
package and are inlined into the packages above at build time, so nothing you install ever names
them.

### Upgrading from 0.4.x

Every package now has exactly ONE entry, and `@comvi/core` is the base host: ICU, async loading, the
plugin host and extension discovery are imports you add, not an entry you switch to. That is a
breaking change on a 0.x minor. Four specifics:

- **ICU syntax on the default compiler throws** instead of rendering wrong text. Name
  `compiler: icuCompiler`.
- **Four loader/plugin members left `useI18n()`** for `useI18nLoader()` / `useI18nPlugins()`.
- **A missing interpolation parameter renders as the literal placeholder.** `t("greet")` on
  `"Hello, {name}!"` gave `"Hello, !"` in 0.4 and gives `"Hello, {name}!"` in 0.5, plus one dev
  warning per template and parameter. Opt out with `missingParam: "drop"`.
- **`.with(…)` is gone**, with no alias. `.use(installer)` is the one verb.

The migration is mechanical, and every rename is tabled: **[MIGRATION.md](MIGRATION.md)** and
[upgrade to 0.5](https://comvi.io/docs/i18n/guides/upgrade-to-v05).

## Design notes

Why the library has the shape it has, kept out of the READMEs so those stay instructions:
[composition](docs/design/composition.md) · [icu](docs/design/icu.md) ·
[rich-text](docs/design/rich-text.md) · [formatting](docs/design/formatting.md) ·
[ssr](docs/design/ssr.md) · [next-runtimes](docs/design/next-runtimes.md) ·
[limitations](docs/design/limitations.md)

## Comvi Platform

Comvi i18n is the open-source library, usable on its own. [**Comvi**](https://comvi.io) is the
optional translation management platform that pairs with it: a collaborative dashboard for
translators and developers, CDN delivery via
[`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader), auto-generated types via
[`@comvi/cli`](packages/cli), and in-context editing in your live app via
[`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor). Adopt it when you're ready;
the library never depends on it.

Comparisons: [vs i18next](https://comvi.io/compare/i18next) ·
[vs next-intl](https://comvi.io/compare/next-intl) ·
[vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n) · [vs Lokalise](https://comvi.io/compare/lokalise)

## Repository

A [pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/) monorepo: `packages/` holds the 14
workspace packages (12 published, plus `locale-routing` and `typegen` inlined into consumers),
`docs/design/` the design notes, `examples/` the runnable StackBlitz demos, `test-apps/` this
workspace's own CI apps and `tooling/` the shared Vite/Vitest config. Every package builds
independently; the 12 publishable ones ship as one release train.

## Development

```bash
pnpm install     # install workspace deps
pnpm build       # build all packages
pnpm -w run test # run all tests
pnpm lint        # lint all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE) © Comvi
