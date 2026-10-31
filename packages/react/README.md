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
components (`useLocale()` for the locale alone, `useFormat()` from `@comvi/react/format` for
numbers and dates), and `<T>` for translations that contain markup.

## Install

```bash
npm install @comvi/react @comvi/core # peer: react 18 or 19; the app imports @comvi/core/cdn
```

## Setup

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";
const i18n = createI18n({
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" }, uk: { greeting: "Привіт, {name}!" } },
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
text params give a string; with a tag handler or an element it is typed `string | ReactElement`
(a handler may return text, a missing key renders its key). `setLocale()` switches once the new catalogs are in (the old locale stays on screen; the last of quick calls wins); it
rejects for an invalid tag or when no catalog of the locale or its parent (`de` for `de-AT`) loaded.

## Namespaces

```tsx title="src/Account.tsx"
import { useI18n } from "@comvi/react";
export function Account() {
  const { t, isReady, isLoading } = useI18n("account");
  if (!isReady) return isLoading ? <p className="spinner" /> : <p>Not available</p>;
  return <h2>{t("title")}</h2>;
}
```

`useI18n("account")` binds `t` and `T` and holds the namespace while mounted: it loads for the
locale on screen and every switch; with no component holding it, it stays cached and a switch
skips it. `isReady`: a catalog of the locale on screen, its parent or a `fallbackLocale` is in;
`isLoading`: one is on the way. A failed load is `false`/`false` only with no usable catalog —
with a fallback locale's catalog in, it is `true`/`false` once the requests finish; a remount does
not retry, but `i18n.load("account")` does (it preloads a route too, holding nothing). `t()` and
`<T>` only read.

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

// 2. Gate: `loading` shows while the first catalogs are not ready. 3. Content.
createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} loading={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

With `suspense`, the provider suspends to the nearest `<Suspense>` instead. Both gate the first
paint only, while a namespace being loaded is not `isReady` (another locale's catalog does not
count), before the children render: an `<I18nHandover>` under a shut gate waits, so pass the data
first. Server renders and hydrations are never gated; a server preloads with `i18n.load()`.

Match a route, cookie or header locale against your supported locales first: `createI18n()` and
`<I18nHandover locale>` throw a `RangeError` for an invalid tag (`t(key, { locale })`, `has()`,
`add()` and `fallbackLocale` entries only report `invalid_locale`); a valid one with no translation falls back.

## Markup in a translation

```tsx
import { T } from "@comvi/react";
// "terms": "Read the <link>terms</link>,<br/><b>in <i>full</i></b>."
<T
  i18nKey="terms"
  link={(chunks) => <a href="/terms">{chunks}</a>}
  br={() => <br />}
  components={{ b: "strong", i: "em" }}
/>;
```

A tag renders through a prop of its name (a handler gets the content as one node), else its
`components` entry (a tag name, a component, or `{ component, props }`, content as `children`),
else as text. `<br/>` renders nothing without its handler (React refuses a `components` `"br"`).
Every prop but `i18nKey`, `components`, `ns`, `locale` and `markers` is a param.

## Read next

- [React guide](https://comvi.io/docs/i18n/react): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): loaders, namespaces, fallbacks.
- [React API reference](https://comvi.io/docs/i18n/api/react): every export, hook and provider prop.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
