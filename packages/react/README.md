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
components, and `<T>` for translations that contain markup.

## Install

```bash
npm install @comvi/react
# Peer: react ^18.0.0 || ^19.0.0
```

## Setup

In `src/main.tsx`:

```tsx title="src/main.tsx"
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

## Use in components

```tsx title="src/App.tsx"
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

`t()` fills `{name}` from its second argument; `{ ns }` and `{ locale }` there switch the
namespace and the locale for one call. `setLocale()` switches once the new locale's catalogs are
in. `useI18n("admin")` binds `t` to a namespace and loads it after the component mounts;
`isLoading` tells you when one of its catalogs is on the way.

## Load from Comvi

```tsx title="src/main.tsx"
import { createI18n, I18nProvider } from "@comvi/react";
import { cdn } from "@comvi/core/cdn";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>"),
});

// `loading` renders until the first catalog is in, so raw keys never paint.
<I18nProvider i18n={i18n} loading={<div className="spinner" />}>
  <App />
</I18nProvider>;
```

With `suspense` instead of `loading`, the provider suspends to the nearest `<Suspense>`.

## Markup in a translation

```tsx
// "terms": "Read the <link>terms</link>."
<T i18nKey="terms" link={(chunks) => <a href="/terms">{chunks}</a>} />
```

Each tag a translator wrote is a prop of the same name; the handler gets the tag's content as one
React node. A tag without a handler renders its content as text.

### How it works

`<I18nProvider>` subscribes to the instance once, through `useSyncExternalStore`, and re-renders
every `useI18n()` consumer when the locale or a catalog changes. `useLocale()` reads the locale
alone, so a namespace load does not re-render a component that only shows the locale.
`<I18nHandover catalogs locale>` renders its subtree with catalogs a server sent and in the route's
locale at once, and gives both to the instance only when the render commits: a render React
abandons, suspends or runs on the server changes nothing. `useFormat()` from
`@comvi/react/format` formats numbers, dates and currency in the locale on screen.

## Read next

- [React guide](https://comvi.io/docs/i18n/react): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): loaders, namespaces, fallbacks.
- [Type safety](https://comvi.io/docs/i18n/type-safety): generated catalogs so `t()` and `<T>` check keys and params.
- [React API reference](https://comvi.io/docs/i18n/api/react): every export, hook and provider prop.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
