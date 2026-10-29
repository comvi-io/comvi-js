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
npm install @comvi/react @comvi/core # the app imports @comvi/core/cdn too
# Peer: react ^18.0.0 || ^19.0.0
```

## Setup

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";

const i18n = createI18n({
  locale: "en",
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
      <select value={locale} onChange={(e) => setLocale(e.target.value).catch(() => {})}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

`t()` fills `{name}` from its second argument (`{ ns }`, `{ locale }` there apply to one call);
text params give a string, a tag handler or an element a React element. `setLocale()` switches
once the new catalogs are in (the old locale stays on screen; of two quick calls the last wins);
it rejects for an invalid tag or when no catalog of the locale or its parent (`de` for `de-AT`)
loaded, and `onError` reports it. `useI18n("admin")` binds `t` and `T` to a namespace and loads
it after mount (`useI18n()` loads `default`); meanwhile `isLoading` is `true` and `t()` returns
what a missing key returns, unreported. A failed load is retried by `i18n.load("admin")` only.

## Load from Comvi

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import { cdn } from "@comvi/core/cdn";
import App from "./App";

// 1. Data. A server-rendered page embeds `handover(i18n)` (`@comvi/core/internal`) as window.__I18N__
//    (its catalogs win over inline `messages`) and calls hydrateRoot(root, …) instead of createRoot.
const i18n = createI18n({
  locale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>"),
  ...(window as { __I18N__?: object }).__I18N__,
});

// 2. Gate: `loading` shows while the first catalogs have no text. 3. Content.
createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} loading={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

With `suspense` instead of `loading`, the provider suspends to the nearest `<Suspense>`. Both
gate the first paint only, while a namespace being loaded has no catalog of any locale. The gate
is decided before the children render, so an `<I18nHandover>` under a shut gate renders only
when it opens: pass the data first, as above. Server renders and hydrations are never gated.

## Markup in a translation

```tsx
import { T } from "@comvi/react";

// "terms": "Read the <link>terms</link>, <b>in <i>full</i></b>."
<T
  i18nKey="terms"
  link={(chunks) => <a href="/terms">{chunks}</a>}
  components={{ b: "strong", i: "em" }}
/>;
```

A tag renders through a prop of its name (a handler gets the content as one node), else its
`components` entry (a tag name, a component, or `{ component, props }` with the content as
`children`), else as text; an `undefined` one is skipped. Every prop but `i18nKey`, `components`,
`ns`, `locale` and `markers` is a param; `markers={false}` opts out of in-context editor marks.

### How it works

`<I18nProvider>` subscribes once (`useSyncExternalStore`) and re-renders `useI18n()` consumers on
a locale or catalog change; `useLocale()` on the locale only. `<I18nHandover catalogs locale>`
renders with a server's catalogs at once and hands them over at commit (any depth in a
hydration). `useFormat()` from `@comvi/react/format` formats numbers, dates, currency and
relative time in the locale on screen, from a handed-over `serverNow` during hydration.

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
