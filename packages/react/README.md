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
npm install @comvi/react @comvi/core
# Peer: react ^18.0.0 || ^19.0.0
```

`@comvi/core` is listed because the app imports from it too (`@comvi/core/cdn` below).

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
      {/* A failed switch keeps the locale on screen; onError reports it, the promise rejects. */}
      <select value={locale} onChange={(e) => setLocale(e.target.value).catch(() => {})}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </>
  );
}
```

`t()` fills `{name}` from its second argument; `{ ns }` and `{ locale }` there switch the
namespace and the locale for one call. A call with text params returns a string; a call with
a tag handler or an element returns a React element. `setLocale()` switches once the new
locale's catalogs are in, and the old locale stays on screen meanwhile; when you switch twice
quickly, the last call wins and the earlier one resolves without switching. It rejects only
when, for every namespace it waited for, no catalog of the new locale or its parent (`de` for
`de-AT`) loaded, and for an invalid locale tag; the locale stays. `useI18n("admin")` binds `t` and
`T` to a namespace and loads it after the component mounts (`useI18n()` loads `default`).
While a catalog of it is on the way `isLoading` is `true` and `t()` returns what a missing key
returns (the key, or your `missing()`), unreported: show your placeholder from `isLoading`. A
load that failed ends that state (fallback text or the key) and is not fetched again when a
component mounts; `i18n.load("admin")` asks again and rejects when the current locale's own
load of it fails with no catalog of that locale or its parent in place (a fallback locale's
failure alone, or a load a switch replaced, resolves).

## Load from Comvi

```tsx title="src/main.tsx"
import { createI18n, I18nProvider } from "@comvi/react";
import { cdn } from "@comvi/core/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>"),
});

// `loading` renders instead of the app while its first catalogs have no text to show.
<I18nProvider i18n={i18n} loading={<div className="spinner" />}>
  <App />
</I18nProvider>;
```

With `suspense` instead of `loading`, the provider suspends to the nearest `<Suspense>`. Both
cover the first paint only (the first render React commits), and only while a namespace being
loaded has no catalog of any locale: inline `messages` or a fallback locale's catalog show at
once. A namespace loaded later keeps the app on screen (show `isLoading`), and a locale switch
keeps the old locale until the new one is in. A server render and a hydration always render the
children: the server preloads what it renders. While `loading` shows, the app is mounted hidden
beside it (`<b hidden>`): its effects run, an `<I18nHandover>` in it hands its catalogs over
(which can end the wait at once), and when the wait ends it mounts again in place. `suspense`
mounts nothing while it suspends, so a handover below it waits for the loads.

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

Each tag a translator wrote renders through a prop of the same name (a handler: it gets the
tag's content as one React node), else its entry in `components` (an HTML tag name, a component,
or `{ component, props }` for one that needs props of its own, such as
`{ component: "a", props: { href: "/terms" } }`; the content is its `children`, nested tags
included). A prop or an entry that is `undefined` leaves the tag to the next; a tag with neither
renders its content as text. With generated catalogs a tag needs its handler prop unless
`components` is passed. Every prop but `i18nKey`, `components` and the per-call options `ns`,
`locale` and `markers` is a message param, `children` included. `markers={false}` keeps the
in-context editor from marking that message (`t()` takes `{ markers: false }`).

### How it works

`<I18nProvider>` subscribes to the instance once, through `useSyncExternalStore`, and re-renders
every `useI18n()` consumer when the locale or a catalog changes. `useLocale()` reads the locale
alone, so a namespace load does not re-render a component that only shows the locale.
`<I18nHandover catalogs locale>` renders its subtree with catalogs a server sent and in the route's
locale at once, and gives both to the instance only when the render commits: a render React
abandons, suspends or runs on the server changes nothing. To hydrate, give the client the same
props, anywhere under the provider: a hydration is never gated by `loading`. An instance created
from the server's payload instead (`createI18n({ ...options, ...payload })`) has the catalogs
before the first render and asks the loader for none of them. `useFormat()` from
`@comvi/react/format` formats numbers, dates, currency and relative time
(`relative(date, { now?, numeric?, style? })`) in the locale on screen; a server clock handed
over as `serverNow` holds for a component's hydration, the browser's clock for every other
render, a component mounted later included (nothing re-renders by itself as time passes).

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
