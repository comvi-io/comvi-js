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
  <a href="https://bundlephobia.com/package/@comvi/react"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/react?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/react"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

Translate a React app with `@comvi/react`: one provider at the root, `useI18n()` in components,
and `<T>` for translations that contain markup. The package depends on `@comvi/core`, so one
install is enough. The full guide is [React](https://comvi.io/docs/i18n/react) on the docs site.

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

`createI18n` builds the i18n instance, which holds the catalog, the current locale and `t()`.
`<I18nProvider>` initializes it on mount, so there is no `init()` call to write.

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
because the provider calls `init()` for you. `fallback` renders in place of the children until the
i18n instance is initialized, so raw keys never paint. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

## Specific to React

- `<I18nProvider>` takes `i18n`, `fallback`, `autoInit`, `onError`, `ssrLocale`, `ssrInitialIsLoading`,
  `ssrInitialIsInitializing`, `targetLocale` and `messages`. Leave `fallback` off when a server render already
  produced real text. `targetLocale` renders the tree in the locale you are switching the i18n
  instance to, until the i18n instance's locale moves, so text commits together with markup that comes with the switch.
  `messages` are catalogs that arrive with the render: the children translate from them at once, and the provider
  adds them to the i18n instance when the render commits, so a render React abandons, or a server render, never
  writes the i18n instance. Keep the `messages` object stable across renders (module scope, `useMemo`,
  or the server payload): an inline literal is a new object on every parent render, and each one is
  added again and re-renders every `useI18n()` consumer.
- `useLocale()` and `useIsLoading()` subscribe to one slice of the state, so namespace loads do not
  re-render a component that only shows the locale.
- `useSetLocaleTransition()` wraps the switch in `useTransition`, so the old UI stays interactive
  while the new catalog loads. The provider subscribes through `useSyncExternalStore`.
- `<T>` maps each tag a translator wrote to a React element, a function component or an HTML tag
  name; children render when the key is missing. Plain `t()` does not parse tags. Define handler
  components outside render, as with any component.
- `@comvi/react` ships no SSR adapter. On Next.js use [`@comvi/next`](https://comvi.io/docs/i18n/next).

## Next steps

- [React guide](https://comvi.io/docs/i18n/react): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): `loader(map)`, namespaces and `useI18nLoader()`.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `t()` and `<T>` check keys and params.
- [React API reference](https://comvi.io/docs/i18n/api/react): every export, hook and provider prop.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
