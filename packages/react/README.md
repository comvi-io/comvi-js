<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/react</h1>

<p align="center">React bindings for Comvi i18n: provider, hooks, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/react"><img src="https://img.shields.io/npm/v/@comvi/react?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=@comvi/react&amp;treeshake=%5B%7BcreateI18n%2CI18nProvider%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react-dom%22%2C%22react/jsx-runtime%22%5D%7D%7D"><img src="https://deno.bundlejs.com/badge?q=@comvi/react&amp;treeshake=%5B%7BcreateI18n%2CI18nProvider%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react-dom%22%2C%22react/jsx-runtime%22%5D%7D%7D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/react"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/react` binds the Comvi i18n instance to React: one provider at the root, `useI18n()` in
components, and `<T>` for translations that contain markup. On Next.js, install
[`@comvi/next`](https://comvi.io/docs/i18n/next) instead; it builds on this package.

## Install

```bash
npm install @comvi/react
# Peer: react ^18.0.0 || ^19.0.0
```

## Setup

In `src/main.tsx`:

```tsx title="src/main.tsx" check=group=react-1
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
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

The i18n instance holds the catalog, the current locale and `t()`. `<I18nProvider>` initializes it
on mount, so there is no `init()` call to write.

## Use in components

In a component, `src/App.tsx`:

```tsx title="src/App.tsx" check=group=react-1
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

`t()` fills `{name}` from its second argument. `setLocale()` resolves once the new locale's
translations are loaded and re-renders every component that called `useI18n()`.
`useI18n('admin')` binds a namespace, so `t('dashboard')` reads `admin:dashboard`.

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

Compose the loader on the instance, in `src/main.tsx`:

```tsx title="src/main.tsx" check=group=react-3
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

`.use(cdnLoader({ cdnUrl }))` fetches each locale from the CDN. Compose inside the `createI18n` expression,
because the provider calls `init()` for you. `fallback` renders in place of the children until the i18n instance is initialized, so raw keys never paint; a server render counts as initialized unless `ssrInitialIsInitializing` is set. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

### How it works

`<I18nProvider>` subscribes to the i18n instance through `useSyncExternalStore` and re-renders every
`useI18n()` consumer when the locale or the catalog changes. `useLocale()` and `useIsLoading()`
subscribe to one slice of the state, so a namespace load does not re-render a component that only
shows the locale. `useSetLocaleTransition()` wraps the switch in `useTransition`, so the old UI
stays interactive while the new catalog loads. `<T i18nKey="…" components={{ link: "a" }}>` maps
each tag a translator wrote to an HTML tag name, a React element or a function component, and
renders its children when the key is missing; plain `t()` does not parse tags.

The provider also takes `autoInit`, `onError`, `ssrLocale`, `targetLocale` and `messages`. Leave
`fallback` off when a server render already produced real text. `targetLocale` renders the tree
in the locale you are switching to until the instance's locale moves, so text commits together
with the markup that comes with the switch. `messages` are catalogs that arrive with the render
(a server payload): the children translate from them at once, and the provider adds them to the
i18n instance when the render commits. Keep that object stable across renders; an inline literal
is a new object every time, and each one re-renders every consumer. `@comvi/react` ships no SSR
adapter; on Next.js use `@comvi/next`.

## Read next

- [React guide](https://comvi.io/docs/i18n/react): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): `loader(map)`, namespaces and `useI18nLoader()`.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `t()` and `<T>` check keys and params.
- [React API reference](https://comvi.io/docs/i18n/api/react): every export, hook and provider prop.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
