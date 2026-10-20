<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-dark.svg">
    <img alt="Comvi" src="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-light.svg" width="860">
  </picture>
</p>

<h1 align="center">Comvi i18n</h1>

<p align="center">
  A small, framework-agnostic i18n library with bindings for <b>React</b>, <b>Next.js</b>, <b>Vue</b>, <b>Nuxt</b>, <b>Svelte</b> and <b>Solid</b>,<br/>
  and a platform that serves translations over a CDN.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue&label=npm" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/@comvi/core"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/core?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml"><img src="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://comvi.io"><img src="https://img.shields.io/badge/Platform-comvi.io-7c3aed" alt="Comvi Platform"></a>
</p>

<p align="center">
  <b><a href="https://comvi.io/docs/i18n">Documentation</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io/docs/i18n/quick-start">Quick start</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io">Comvi Platform</a></b>
</p>

---

Comvi i18n puts translated text on screen from a catalog in your source or from the Comvi platform
over a CDN. `createI18n()` returns the i18n instance, which holds the catalog, the current
locale and `t()`; a binding hands it to your framework. ICU plurals, async loading, locale
detection and the in-context editor are opt-in: you compose them with `.use()`, and an app carries
only what it names.

## Install

One package per framework; each binding brings `@comvi/core` with it.

```bash
npm install @comvi/react
npm install @comvi/next     # Peers: next ^15 || ^16, react ^18.2 || ^19
npm install @comvi/vue
npm install @comvi/nuxt
npm install @comvi/svelte
npm install @comvi/solid
npm install @comvi/core     # vanilla JavaScript
```

| Framework          | Package         | Peer dependencies | Guide                                         |
| ------------------ | --------------- | ----------------- | --------------------------------------------- |
| Vanilla JavaScript | `@comvi/core`   | none              | [Vanilla](https://comvi.io/docs/i18n/vanilla) |
| React              | `@comvi/react`  | `react`           | [React](https://comvi.io/docs/i18n/react)     |
| Next.js            | `@comvi/next`   | `next`, `react`   | [Next.js](https://comvi.io/docs/i18n/next)    |
| Vue                | `@comvi/vue`    | `vue`             | [Vue](https://comvi.io/docs/i18n/vue)         |
| Nuxt               | `@comvi/nuxt`   | `nuxt`            | [Nuxt](https://comvi.io/docs/i18n/nuxt)       |
| Svelte             | `@comvi/svelte` | `svelte`          | [Svelte](https://comvi.io/docs/i18n/svelte)   |
| Solid              | `@comvi/solid`  | `solid-js`        | [Solid](https://comvi.io/docs/i18n/solid)     |

The packages are ESM-only and versioned in lockstep, so install matching versions of every
`@comvi/*` package. The runtime packages need Node 20 or newer; `@comvi/cli` and
`@comvi/vite-plugin` need Node 22.

## Quick start

Create the i18n instance and hand it to React, in `src/main.tsx`:

```tsx title="src/main.tsx" check=group=index-1
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider, useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

function App() {
  const { t } = useI18n();
  return <h1>{t("greeting", { name: "Alice" })}</h1>;
}

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
);
```

`createI18n` builds the i18n instance, `<I18nProvider>` initializes it, and `useI18n()` gives your
components `t()`, the current locale and `setLocale()`. The same three calls in every binding:
[Quick start](https://comvi.io/docs/i18n/quick-start).

## Connect to Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

Compose the loader on the instance, in `src/main.tsx`:

```tsx title="src/main.tsx" check=group=connect-comvi-react-1
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }));

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} fallback={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

`.use(cdnLoader({ cdnUrl }))` fetches each locale from the CDN, so a wording change ships when a translator
saves it, without a redeploy. The CDN URL comes from **Settings → Content Deploy** in the Comvi
project; the walkthrough is [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your
keys use ICU (`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are independent.

## Plugins and tooling

| Package                                                                | What it does                                            | Docs                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader)           | Load translations from the Comvi CDN or API             | [Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader)           |
| [`@comvi/plugin-locale-detector`](packages/plugin-locale-detector)     | Detect the locale from query, cookie, storage, browser  | [Locale detector](https://comvi.io/docs/i18n/plugins/locale-detector)     |
| [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor) | Edit translations inside the running app                | [In-context editor](https://comvi.io/docs/i18n/plugins/in-context-editor) |
| [`@comvi/vite-plugin`](packages/vite-plugin)                           | Generate `TranslationKeys` from local JSON at dev/build | [Vite plugin](https://comvi.io/docs/i18n/plugins/vite-plugin)             |
| [`@comvi/cli`](packages/cli)                                           | Pull, push and generate types from the Comvi platform   | [Comvi CLI](https://comvi.io/docs/cli)                                    |

`locale-routing` and `typegen` are private workspace packages, inlined into the packages above at build time.

## Repository

A [pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/) monorepo: `packages/` holds the
workspace packages, `examples/` the runnable StackBlitz demos, `docs/design/` the design notes,
`test-apps/` this workspace's own CI apps and `tooling/` the shared Vite/Vitest config.
`pnpm install && pnpm build && pnpm -w run test` runs the whole thing; the gates a change has to
pass are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Comvi
