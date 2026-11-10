<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/solid</h1>

<p align="center">SolidJS bindings for Comvi i18n: a provider, <code>useI18n()</code>, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/solid"><img src="https://img.shields.io/npm/v/@comvi/solid?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/solid"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/solid` binds the Comvi i18n instance to Solid: `<I18nProvider>` once, `useI18n()` in
components, and `<T>` for translations that contain markup.

## Install

```bash
npm install @comvi/solid @comvi/core # peer: solid-js ^1.8.0; the app imports @comvi/core/cdn
```

## Setup

```tsx title="src/index.tsx"
import { render } from "solid-js/web";
import { createI18n, I18nProvider } from "@comvi/solid";
import { App } from "./App";

const i18n = createI18n({
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" }, uk: { greeting: "Привіт, {name}!" } },
});

const Root = () => <I18nProvider i18n={i18n}>{<App />}</I18nProvider>;
render(Root, document.getElementById("app")!);
```

## Use in components

```tsx title="src/App.tsx"
import { createSignal } from "solid-js";
import { useI18n } from "@comvi/solid";

export function App() {
  const { t, locale, setLocale } = useI18n();
  const [failed, setFailed] = createSignal(false);
  // A switch that cannot load (a network error) rejects and keeps the old locale on screen.
  const toggle = () =>
    setLocale(locale() == "en" ? "uk" : "en").then(
      () => setFailed(false),
      () => setFailed(true),
    );
  return (
    <>
      <button onClick={toggle}>{t("greeting", { name: "Alice" })}</button>
      {failed() && <p role="alert">Could not switch the language. Try again.</p>}
    </>
  );
}
```

`t()` fills `{name}` from its second argument (`{ ns }`, `{ locale }` there apply to one call) and
re-runs in JSX, a memo or an effect on a new state. `locale`, `dir`, `isReady` and `isLoading` are
accessors; `locale` and `dir` re-run their readers on a change of their value only. `setLocale()`
keeps the old locale until the new catalogs are in (the last of quick switches wins), and rejects
for an invalid tag, or when no catalog of the locale or its parent (`de` for `de-AT`) loaded for any
namespace it waited for.

```tsx title="src/Account.tsx"
import { useI18n } from "@comvi/solid";

export function Account() {
  const { t, isReady, isLoading } = useI18n("account");
  return <h2>{isReady() ? t("title") : isLoading() ? "…" : "Not available"}</h2>;
}
```

`useI18n("account")` binds `t` and `T` and holds the namespace from mount to cleanup: it loads for
the locale on screen and every switch; with no component holding it, it stays cached and a switch
skips it. `isReady`: a catalog of the locale on screen, its parent or a `fallbackLocale` is in;
`isLoading`: one is on the way. A failed load is `false`/`false` only with no usable catalog; a
remount does not retry, `i18n.load("account")` does. `t()` and `<T>` only read (development warns
about a namespace nothing loads). `useFormat()` from `@comvi/solid/format` formats numbers,
currency, dates, lists and relative time in the locale on screen, re-running on a switch.

`useI18n()` with no namespace reads `default` (what its `t` reads) and every namespace of the
`namespaces` option: `isReady` once each has a usable catalog (a catalog, not every key),
`isLoading` while one of them loads, so an app root can branch on it. It is no longer
`useI18n("default")`, which reads `default` alone. Check `isReady` first: a switch loads beside the
text on screen. `false`/`false` means the text is unavailable and nothing is loading — a failed
load or no loader, not necessarily an error.

## Load from Comvi

```tsx title="src/index.tsx"
import { createI18n } from "@comvi/solid";
import { cdn } from "@comvi/core/cdn";

export const i18n = createI18n({
  locale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>"),
});
// <I18nProvider i18n={i18n} loading={<p>Loading…</p>}>: `loading` replaces the children for the
// instance's first paint only, while no catalog is usable for the locale.
```

## Markup in a translation

```tsx
import type { ParentProps } from "solid-js";
import { T } from "@comvi/solid";
const TermsLink = (p: ParentProps) => <a href="/terms">{p.children}</a>;
// "terms": "Read the <link>terms</link>,<br/><b>in <i>full</i></b>."
export const Terms = () => (
  <T i18nKey="terms" components={{ link: TermsLink, b: "strong", i: "em", br: "br" }} />
);
```

A tag renders through a handler prop of its name (`link={(c) => <a href="/terms">{c}</a>}`), else its
`components` entry (a tag name, a component, or `{ component: "a", props: { href: "/terms" } }`; the
content is its `children`, and an empty tag passes none, so `<br/>` renders a real `<br>`), else as
text. Every other prop but `i18nKey`, `ns`, `locale` and `markers` is a param, `class` too; a param
is always text, so a JSX element there is unsupported (it hydrates with a mismatch) and markup goes in a tag around it
(`"Hello, <strong>{name}</strong>!"` with `components={{ strong: "strong" }}`). `<T>`
re-renders on a change of its props, the locale or its namespace's catalogs, not on another
namespace's load.

## Server rendering

An instance per request, under a `<Suspense>` boundary: `useI18n(ns)` holds its namespace for the
request and the boundary waits through `createResource` until the catalog is in, in
`renderToStringAsync` and in a stream (the response holds until then). `renderToString` is
synchronous: load first (`await i18n.load(ns)`) or get the fallback. Match a locale from a route,
cookie or header against your supported locales first: `createI18n()` throws a `RangeError` for one
that is not a tag.

```tsx title="src/entry-server.tsx"
import { Suspense } from "solid-js";
import { renderToStringAsync } from "solid-js/web";
import { createI18n, handover, I18nProvider } from "@comvi/solid";

const i18n = createI18n({ ...options, locale, timeZone: "UTC" }); // timeZone: required
const Page = () => <I18nProvider i18n={i18n}>{<App />}</I18nProvider>;
const html = await renderToStringAsync(() => <Suspense>{<Page />}</Suspense>);
const payload = JSON.stringify(handover(i18n)).replace(/</g, "\\u003c");
// The page embeds it: <script>window.__I18N__ = ${payload}</script>
```

In the browser, `createI18n({ ...options, ...window.__I18N__ })` starts from the server's state: the
same `isReady`/`isLoading`, no mismatch, nothing fetched that the server rendered. In SolidStart,
keep the instance on `getRequestEvent().locals` and write the payload with `useAssets`
([example](https://github.com/comvi-io/comvi-js/tree/main/examples/solidstart)).

## Read next

- [Solid guide](https://comvi.io/docs/i18n/solid): markup inside a translation, first paint, SSR.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): loaders, namespaces, fallbacks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
