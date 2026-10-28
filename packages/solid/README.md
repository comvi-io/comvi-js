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
  <a href="https://bundlejs.com/?q=@comvi/solid&amp;treeshake=%5B%7BcreateI18n%2CI18nProvider%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22solid-js%22%2C%22solid-js/web%22%2C%22solid-js/store%22%5D%7D%7D"><img src="https://deno.bundlejs.com/badge?q=@comvi/solid&amp;treeshake=%5B%7BcreateI18n%2CI18nProvider%2CuseI18n%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22solid-js%22%2C%22solid-js/web%22%2C%22solid-js/store%22%5D%7D%7D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/solid"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/solid` binds the Comvi i18n instance to Solid's signals: `<I18nProvider>` holds it, and
`useI18n()` gives your components `t()`, `locale()` and `setLocale()`. The package depends on
`@comvi/core`, so one install is enough.

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

Pass the CDN loader (`@comvi/core/cdn`) as the instance's `loader`, in `src/index.tsx`:

```tsx title="src/index.tsx" check=group=solid-cdn
import { render } from "solid-js/web";
import { createI18n, I18nProvider } from "@comvi/solid";
import { cdn } from "@comvi/core/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>"),
});

render(
  () => (
    <I18nProvider i18n={i18n} fallback={<div class="spinner" />}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

`fallback` renders in place of the children until the i18n instance is initialized. The CDN URL is
on [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi).

## Specific to Solid

- `useI18n('admin')` binds a namespace at the type level too. The `formatNumber`, `formatDate`,
  `formatCurrency` and `formatRelativeTime` members follow the locale like `t()`, and a trailing
  `locale` argument overrides it. Outside a component, import the same four from `@comvi/solid`
  and pass the instance first: `formatRelativeTime(i18n, -2, 'hour')`.
- `<T components={{ link: (props) => <a href="/docs">{props.children}</a> }} />`: each tag maps to a
  plain function or an element name such as `{ policy: 'a' }`. Plain `t()` does not parse tags.
- `<I18nProvider>` initializes from a `createEffect`, and effects do not run during Solid's server
  render, so a loader fetches nothing there. Load the messages in a server function with a fresh
  instance per request, build the instance from the result inside the route, and pass `ssrLocale`.
  In SolidStart, use the route's locale param as the resource's source, render through
  `<Show keyed>` so a link to another locale builds a new instance, and pass `deferStream: true` so
  the HTML carries the text instead of a streamed `<template>`. Never share a module-level instance across SSR requests; one is fine for a client-only app. `ssrLocale` paints on the first render when that locale's catalogs are already available (inline `messages`, or loaded earlier); otherwise the first render is in the instance's current locale and the switch lands when the load completes.

## Read next

- [Solid guide](https://comvi.io/docs/i18n/solid): tracking scopes, rich text, SSR.
- [Solid API reference](https://comvi.io/docs/i18n/api/solid): every export, the standalone primitives and `<T>` props.
- [SolidStart SSR](https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart): the server function, the route and the provider.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generate `TranslationKeys` so `t()` autocompletes.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
