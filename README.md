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
  <a href="https://bundlejs.com/?q=@comvi/react&amp;treeshake=%5B%7BcreateI18n%2CI18nProvider%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react-dom%22%2C%22react/jsx-runtime%22%5D%7D%7D"><img src="https://deno.bundlejs.com/badge?q=@comvi/react&amp;treeshake=%5B%7BcreateI18n%2CI18nProvider%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react-dom%22%2C%22react/jsx-runtime%22%5D%7D%7D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml"><img src="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://comvi.io"><img src="https://img.shields.io/badge/Platform-comvi.io-7c3aed" alt="Comvi Platform"></a>
</p>

<p align="center">
  <b><a href="https://comvi.io/docs/i18n">Documentation</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io/docs/i18n/quick-start">Quick start</a></b>
  &nbsp;·&nbsp;
  <b><a href="examples/README.md">Live examples</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io">Comvi Platform</a></b>
</p>

---

Comvi i18n puts translated text on screen, from a catalog in your source or from the
[Comvi platform](https://comvi.io) over a CDN. It is a framework-agnostic core with bindings for
React, Next.js, Vue, Nuxt, Svelte and Solid, and plugins you add only when you need them.

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

| Framework          | Package         | Peer dependencies | Guide                                         | Try it                                                                                   |
| ------------------ | --------------- | ----------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| React              | `@comvi/react`  | `react`           | [React](https://comvi.io/docs/i18n/react)     | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/react)   |
| Next.js            | `@comvi/next`   | `next`, `react`   | [Next.js](https://comvi.io/docs/i18n/next)    | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/next)    |
| Vue                | `@comvi/vue`    | `vue`             | [Vue](https://comvi.io/docs/i18n/vue)         | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vue)     |
| Nuxt               | `@comvi/nuxt`   | `nuxt`            | [Nuxt](https://comvi.io/docs/i18n/nuxt)       | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/nuxt)    |
| Svelte             | `@comvi/svelte` | `svelte`          | [Svelte](https://comvi.io/docs/i18n/svelte)   | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/svelte)  |
| Solid              | `@comvi/solid`  | `solid-js`        | [Solid](https://comvi.io/docs/i18n/solid)     | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/solid)   |
| Vanilla JavaScript | `@comvi/core`   | none              | [Vanilla](https://comvi.io/docs/i18n/vanilla) | [StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vanilla) |

The packages are ESM-only and released together, so install the same version of every
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

`<I18nProvider>` initializes the i18n instance, and `useI18n()` gives your components `t()`, the
current locale and `setLocale()`. Every binding has the same shape: create the instance, hand it
to the framework, call `useI18n()` in components. The other frameworks are on
[Quick start](https://comvi.io/docs/i18n/quick-start).

### How it works

`createI18n()` returns the i18n instance: it holds the catalog, the current locale and `t()`. A
binding hands the instance to your framework and re-renders what reads it when the locale or the
catalog changes. The base instance does text and `{param}` interpolation. Async loading, locale
detection and the in-context editor are capabilities you compose with `.use(installer)`, and ICU
plurals are a constructor option, `compiler: icuCompiler`; what you never name never enters your
bundle.

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

`.use(cdnLoader({ cdnUrl }))` fetches each locale from the CDN, so a wording change ships when a
translator saves it, without a redeploy. The CDN URL comes from **Settings → Content Deploy** in
the Comvi project; the walkthrough is [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi).
If your keys use ICU (`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

## Plugins and tooling

| Package                                                                | What it does                                            | Docs                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader)           | Load translations from the Comvi CDN or API             | [Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader)           |
| [`@comvi/plugin-locale-detector`](packages/plugin-locale-detector)     | Detect the locale from query, cookie, storage, browser  | [Locale detector](https://comvi.io/docs/i18n/plugins/locale-detector)     |
| [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor) | Edit translations inside the running app                | [In-context editor](https://comvi.io/docs/i18n/plugins/in-context-editor) |
| [`@comvi/vite-plugin`](packages/vite-plugin)                           | Generate `TranslationKeys` from local JSON at dev/build | [Vite plugin](https://comvi.io/docs/i18n/plugins/vite-plugin)             |
| [`@comvi/cli`](packages/cli)                                           | Pull, push, check and generate types from the terminal  | [Comvi CLI](https://comvi.io/docs/cli)                                    |

## Contributing

Bug reports, docs fixes and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains
the repository layout, the setup and what CI checks.

## License

[MIT](LICENSE) © Comvi
