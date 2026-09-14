<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-dark.svg">
    <img alt="Comvi" src="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-light.svg" width="860">
  </picture>
</p>

<h1 align="center">Modern i18n for JavaScript & TypeScript</h1>

<p align="center">
  One framework-agnostic core. ICU MessageFormat and rich text without XSS —<br/>
  for <b>Vue</b>, <b>React</b>, <b>SolidJS</b>, <b>Svelte</b>, <b>Next.js</b>, and <b>Nuxt</b>.
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
  <b><a href="https://comvi.io/docs/i18n/quick-start/">Documentation</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io">Comvi Platform</a></b>
</p>

---

## What this is

An i18n library for JavaScript and TypeScript apps: you write `t("greeting", { name })`, it renders
the right string for the active locale. One core, six framework bindings, ICU MessageFormat, rich
text that embeds components into a sentence without raw HTML, and typed translation keys.

It works standalone with catalogs you ship in your bundle. It also pairs with
[Comvi](https://comvi.io), a translation management platform that serves catalogs from a CDN so you
can ship a translation without a redeploy.

## Install

One install is enough: each framework package bundles `@comvi/core`.

```bash
npm install @comvi/core      # Vanilla / Node
npm install @comvi/vue       # Peer: vue ^3
npm install @comvi/react     # Peer: react ^18 || ^19
npm install @comvi/solid     # Peer: solid-js ^1.8
npm install @comvi/svelte    # Peer: svelte ^5.3
npm install @comvi/next      # Peers: next ^14 || ^15, react ^18 || ^19
npm install @comvi/nuxt      # Peer: nuxt ^3 || ^4
```

Node 20 or newer. Loading translations from the Comvi platform adds the loader plugin beside the
framework package:

```bash
npm install @comvi/react @comvi/plugin-fetch-loader
```

## Quick start

Two steps, and the second is additive. Every framework README tells the same two-step story in its
own idiom: [react](packages/react) · [vue](packages/vue) · [solid](packages/solid) ·
[svelte](packages/svelte) · [next](packages/next) · [nuxt](packages/nuxt) ·
[core / vanilla](packages/core). React is the example here.

### Step 1 — an inline catalog

Five things to know: `createI18n` builds the host (the host is the i18n instance `createI18n`
returns), `locale` is what renders now, `fallbackLocale` is what covers a missing key, `translation`
is the catalog, and the provider puts the host where `useI18n()` can find it.

```tsx title="src/main.tsx"
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

```tsx title="src/App.tsx"
import { useI18n } from "@comvi/react";

export default function App() {
  const { t, locale, setLocale } = useI18n();

  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <button onClick={() => setLocale(locale === "en" ? "uk" : "en")}>Switch</button>
    </>
  );
}
```

Runnable version: [`examples/react`](examples/react), which opens in
[StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/react) straight from the repository — see
[examples/README.md](examples/README.md) for the link pattern.

### Step 2 — connect to Comvi

Two additions to the host, and nothing else changes:

1. `compiler: icuCompiler`. The platform's catalogs use ICU plurals. Without the compiler an ICU
   message throws in development and renders literally in production.
2. `.use(cdnLoader({ cdnUrl }))`, which fetches the catalog at runtime.

The catalog is now in flight during the first paint, so pass a `fallback` to gate it.

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, icuCompiler, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} fallback={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and read it off the
**Distributions** page.

`.use(installer)` is the one composition verb. Compose before `init()`: composing after it warns
once per host in development. Composing the same capability twice installs nothing the second time,
though a second `loader(map)` does still register its map — configuration is not installation
([`packages/core/src/loader.ts:82-90`](packages/core/src/loader.ts)). Beyond that there is no
ordering rule, and ICU is not composed at all: it is a constructor option.

## What is portable across frameworks

Portable, identically, in all six bindings:

- **`useI18n()`** and the member names it returns — `t`, `tRaw`, `locale`, `setLocale`,
  `isLoading`, `isInitializing`, `isInitialized`, `cacheRevision`.
- **`t()`** and its overloads, including `useI18n("admin")` binding a namespace at the type level.
- **Typed keys.** One `TranslationKeys` augmentation serves every binding.
- **ICU** syntax and behaviour, through the same `compiler: icuCompiler` option.
- **Capability acquisition**: `useI18nLoader()` and `useI18nPlugins()`.

Not portable, by design: **`<T>` follows each framework's own idiom** for its `components` map.
React takes elements to clone, vue takes named slots, solid takes functions, svelte takes tag names
or `{ tag, props }` configs. See that framework's README. **SSR rules differ too**, and one of them
inverts: Next requires a module-scope host, while Solid, Svelte, Vue and Nuxt each forbid one. The
four rules sit side by side in [docs/design/ssr.md](docs/design/ssr.md).

Reactivity of the four `Intl` formatters differs as well: React and Vue re-render on a locale
change, Svelte and Solid do not. [docs/design/formatting.md](docs/design/formatting.md) has the
table and the one-line rule.

## Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key.
Generate it with [`@comvi/cli`](packages/cli) from the platform, or
[`@comvi/vite-plugin`](packages/vite-plugin) from local JSON.

```typescript check=group=typed-keys
// src/types/i18n.d.ts
import "@comvi/core"; // resolves the module before augmenting it

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    hello: never;
    "errors:NOT_FOUND": never;
  }
}
```

```ts check=group=typed-keys
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.t("welcome", { name: "Alice" }); // params shape matches the declaration
i18n.t("hello"); // no params needed
i18n.t("NOT_FOUND", { ns: "errors" }); // namespaced keys use the ns option
```

What TypeScript catches:

```ts check=group=typed-keys check=expect-error=TS2345
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

// TS2345 — `welcome` declares a required param, so the key-only overload is out.
i18n.t("welcome");
```

```ts check=group=typed-keys check=expect-error=TS2769
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

// TS2769 — Property 'name' is missing in type '{ age: number }'
i18n.t("welcome", { age: 5 });

// TS2769 — Type 'number' is not assignable to type 'string'
i18n.t("welcome", { name: 42 });

// TS2769 — '"typo"' is not a declared key
i18n.t("typo", { name: "Alice" });
```

## What it weighs

Measured min+gz through each package's published exports map. Every figure names the fixture it
comes from; the fixtures and their gates live in
[`scripts/size-budgets.json`](scripts/size-budgets.json) and the rule behind them in
[`scripts/size-budgets.md`](scripts/size-budgets.md). Framework peers are externalized, so a
framework row measures the comvi graph only.

| app shape                                | fixture                        | min+gz  |
| ---------------------------------------- | ------------------------------ | ------- |
| `@comvi/core` alone, nothing composed    | `core-base`                    | 5270 B  |
| `@comvi/core` + ICU                      | `core-base-icu`                | 6183 B  |
| every core capability composed           | `core-full-composite`          | 8874 B  |
| `@comvi/react`, base host + bindings     | `fw-react-default`             | 6902 B  |
| `@comvi/react` + ICU + the CDN loader    | `platform-path-react`          | 10793 B |
| core + ICU + the CDN-only loader subpath | `plugin-fetch-loader-cdn-lite` | 9173 B  |

Every capability is an import you add, so an app carries only what it composes. No `eval` and no
`new Function` in any runtime package, so everything runs under a strict CSP without `unsafe-eval`.
`@comvi/core` has zero runtime dependencies.

## Packages

### Frameworks

| Package                            | Description                                           | Docs                                     |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| [`@comvi/core`](packages/core)     | Framework-agnostic runtime, ICU parser, plugin system | [→](https://comvi.io/docs/i18n/vanilla/) |
| [`@comvi/vue`](packages/vue)       | Vue 3 plugin, `useI18n()`, `<T>` component            | [→](https://comvi.io/docs/i18n/vue/)     |
| [`@comvi/react`](packages/react)   | `<I18nProvider>`, `useI18n()` hook, `<T>` component   | [→](https://comvi.io/docs/i18n/react/)   |
| [`@comvi/solid`](packages/solid)   | SolidJS provider + reactive signals + `<T>` component | [→](https://comvi.io/docs/i18n/solid/)   |
| [`@comvi/svelte`](packages/svelte) | Svelte stores + context (Svelte 5) + `<T>` component  | [→](https://comvi.io/docs/i18n/svelte/)  |
| [`@comvi/next`](packages/next)     | Next.js App Router: SSR, middleware, locale routing   | [→](https://comvi.io/docs/i18n/next/)    |
| [`@comvi/nuxt`](packages/nuxt)     | Nuxt 3 / 4 module: auto-imports, SSR, locale routing  | [→](https://comvi.io/docs/i18n/nuxt/)    |

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
- **Four loader/plugin members left `useI18n()`.** Acquire them from `useI18nLoader()` /
  `useI18nPlugins()`.
- **A missing interpolation parameter renders as the literal placeholder.** `t("greet")` on
  `"Hello, {name}!"` gave `"Hello, !"` in 0.4 and gives `"Hello, {name}!"` in 0.5, plus one dev
  warning per template and parameter. An explicit `null` still renders as an empty string. Opt out
  with `missingParam: "drop"`.
- **`.with(…)` is gone**, with no alias. `.use(installer)` is the one verb.

The migration is mechanical and mostly codemodded. See **[MIGRATION.md](MIGRATION.md)**.

## Design notes

Why the library has the shape it has, kept out of the READMEs so those stay instructions:

| Note                                             | What it covers                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| [composition.md](docs/design/composition.md)     | one entry per package, `.use(installer)`, why ICU is a constructor option   |
| [icu.md](docs/design/icu.md)                     | the grammar that is implemented, the gaps, fail-loud/fail-soft              |
| [rich-text.md](docs/design/rich-text.md)         | `<T>` versus the ambient `t()` tag grammar                                  |
| [formatting.md](docs/design/formatting.md)       | `Intl` formatters, and where the four bindings disagree on reactivity       |
| [ssr.md](docs/design/ssr.md)                     | the four module-scope rules side by side                                    |
| [next-runtimes.md](docs/design/next-runtimes.md) | why the Next config module is evaluated twice, and what must not reach Edge |
| [limitations.md](docs/design/limitations.md)     | everything the library does not do, in one list                             |

## Comvi Platform

Comvi i18n is the open-source library, and it is usable on its own.
[**Comvi**](https://comvi.io) is the optional translation management platform that pairs with it:

- **Collaborative dashboard** for translators, designers, and developers
- **CDN delivery** via [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader), so you can ship
  a translation without a redeploy
- **Auto-generated types** straight from the platform via [`@comvi/cli`](packages/cli)
- **In-context editing** in your live app via
  [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor)

Adopt the platform when you're ready. The library never depends on it.

Comparisons: [vs i18next](https://comvi.io/compare/i18next/) ·
[vs next-intl](https://comvi.io/compare/next-intl/) ·
[vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n/) ·
[vs Lokalise](https://comvi.io/compare/lokalise/)

## Repository

```
packages/        — 14 workspace packages: 12 published to npm, plus
                   locale-routing and typegen (private, inlined into consumers)
docs/design/     — design notes; not published to npm
examples/        — runnable StackBlitz demos, one per framework, for readers
test-apps/       — this workspace's own test apps, for CI
tooling/         — shared internal Vite/Vitest config
```

[pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/) monorepo. Every package builds
independently; the 12 publishable ones ship to npm under the `@comvi/*` scope as one release train.

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
