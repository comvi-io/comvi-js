<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/solid</h1>

<p align="center">SolidJS bindings for Comvi i18n: provider, signal-backed accessors, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/solid"><img src="https://img.shields.io/npm/v/@comvi/solid?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/solid"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/solid?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/solid` binds the i18n instance to Solid's signals: `<I18nProvider>` holds it, and `useI18n()`
gives your components `t()`, `locale()` and `setLocale()`. The package depends on `@comvi/core`, so
one install is enough. The full guide is [Solid](https://comvi.io/docs/i18n/solid) on the docs
site.

## Install

```bash
npm install @comvi/solid
# Peer: solid-js ^1.8.0
```

## Setup

In `src/index.tsx`:

```tsx title="src/index.tsx" check=group=solid-2
import { render } from "solid-js/web";
import { createI18n, I18nProvider } from "@comvi/solid";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

render(
  () => (
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

`createI18n` builds the i18n instance and `<I18nProvider>` initializes it from an effect, so there is no
`init()` call to write. Its other props are `autoInit`, `onError`, `fallback` and `ssrLocale`.

## Use in components

In a component, `src/App.tsx`:

```tsx title="src/App.tsx" check=group=solid-2
import { useI18n } from "@comvi/solid";

export default function App() {
  const { t, locale, setLocale } = useI18n();

  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <select value={locale()} onChange={(e) => setLocale(e.currentTarget.value)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

`locale` is an `Accessor<string>`, and `setLocale()` resolves once the new locale's catalog has
loaded. `t()` and `tRaw()` read the locale and cache signals at call time, so they stay reactive
only inside JSX, a `createMemo` or a `createEffect`; `const greeting = t('greeting')` in the
component body is computed once and never updates.

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

Compose the loader on the instance, in `src/index.tsx`:

```tsx title="src/index.tsx" check=group=solid-cdn
import { render } from "solid-js/web";
import { createI18n, I18nProvider } from "@comvi/solid";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }));

render(
  () => (
    <I18nProvider i18n={i18n} fallback={<div class="spinner" />}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

Compose `.use(cdnLoader({ cdnUrl }))` inside the `createI18n` expression, because the provider calls `init()`
for you. `fallback` renders in place of the children until the i18n instance is initialized. The CDN URL is
on [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

## Specific to Solid

- `useI18n('admin')` binds a namespace at the type level too. The `formatNumber`, `formatDate`,
  `formatCurrency` and `formatRelativeTime` members follow the locale like `t()`, and a trailing
  `locale` argument overrides it.
- `<T components={{ link: (props) => <a href="/docs">{props.children}</a> }} />`: each tag maps to a
  plain function or an element name such as `{ policy: 'a' }`. Plain `t()` does not parse tags.
- `<I18nProvider>` initializes from a `createEffect`, and effects do not run during Solid's server
  render, so a loader fetches nothing there. Load the messages in a server function with a fresh
  instance per request, render through `<I18nProvider autoInit={false}>`, and pass `ssrLocale` on both
  sides. Never share a module-level instance across SSR requests; one is fine for a client-only app. `ssrLocale` paints on the first render when that locale's catalogs are already available (inline `messages`, or loaded earlier); otherwise the first render is in the instance's current locale and the switch lands when the load completes.

## Next steps

- [Solid guide](https://comvi.io/docs/i18n/solid): tracking scopes, rich text, SSR.
- [Solid API reference](https://comvi.io/docs/i18n/api/solid): every export, the standalone primitives and `<T>` props.
- [SolidStart SSR](https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart): the server function, the route and the provider.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `t()` autocompletes.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
