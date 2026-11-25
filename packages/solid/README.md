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

`@comvi/solid` is the SolidJS binding of Comvi i18n: a provider, `useI18n()` and the `<T>`
component. Create the i18n instance, pass it to `<I18nProvider>`, and read translations in any
component below it.

## Install

```bash
npm install @comvi/solid @comvi/core # peer: solid-js ^1.8.0
```

`@comvi/core` and every binding in an app must be on one version: two copies of `@comvi/core` (two
versions, or one version installed twice) throw an error that names both versions.

## Setup

```tsx title="src/index.tsx" check=group=solid-app
import { render } from "solid-js/web";
import { createI18n, I18nProvider, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" }, uk: { greeting: "Привіт, {name}!" } },
});

function App() {
  const { t, locale, setLocale } = useI18n();
  const toggle = () => setLocale(locale() === "en" ? "uk" : "en");
  return <button onClick={toggle}>{t("greeting", { name: "Alice" })}</button>;
}

const Root = () => (
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>
);
render(Root, document.getElementById("app")!);
```

`t()` fills `{name}` from its second argument. `locale`, `dir`, `isReady` and `isLoading` are
accessors: call them (`locale()`). Both catalogs are inline, so the switch loads nothing; with a
`loader`, `setLocale()` can reject: see [A rejected `setLocale()`](#a-rejected-setlocale).

## Typed keys

Typed keys come from JSON catalogs: `src/locales/<locale>.json` is the `default` namespace,
`src/locales/<namespace>/<locale>.json` the others. Install `@comvi/vite-plugin` as a dev dependency
and add `comviTypes({ from: "./src/locales", sourceLocale: "en" })` to the `plugins` of
`vite.config.ts`. `vite dev` and `vite build` then write `src/types/i18n.d.ts`; keep it inside the
`include` of your `tsconfig.json`. For `{ "greeting": "Hello, {name}!" }` in `src/locales/en.json`
the file reads, after a header comment:

<!-- prettier-ignore -->
```ts title="src/types/i18n.d.ts" check=group=solid-typed
import '@comvi/core';

declare module '@comvi/core' {
  interface Catalogs {
    "default": {
      "greeting": { "name": string | number };
    };
  }
}

export {};
```

From then on, a key that is not in the catalog is a type error:

```tsx title="src/Greeting.tsx" check=group=solid-typed check=expect-error=TS2345
import { useI18n } from "@comvi/solid";

export function Greeting() {
  const { t } = useI18n();
  return <h1>{t("greting", { name: "Alice" })}</h1>; // "greting" is not a key
}
```

A param the message uses is required too. A misspelt namespace is an error in `useI18n(ns)` and
`t(key, { ns })`, and still compiles in `load()`, `add()`, `has()` and the `namespaces` option
([limit](https://comvi.io/docs/i18n/limitations#namespace-typos-config)). Without Vite, see
[Type safety](https://comvi.io/docs/i18n/type-safety).

## Namespaces: `isReady`, `isLoading` and `ready`

`useI18n("account")` binds `t` to the `account` namespace and holds the namespace while the
component is mounted: it loads for the locale on screen and for every locale a switch goes to.
`isReady` is `true` when a catalog of the namespace is usable for the locale on screen; `isLoading`
is `true` while one is on the way. Check `isReady` first: a switch loads the new catalogs beside the
text on screen. Both `false` means the text is not available and nothing is loading. `i18n.ready` is
something else: a promise that resolves when the loads in flight have settled, the failed ones too.
After a failed first load, `ready` has resolved and `isReady` is `false`.

### Retry with `load()`

A namespace whose load failed renders its "not available" branch, and mounting the component again
does not call the loader. `i18n.load(ns)` does: it calls the loader again for the catalogs of `ns`
that failed, and it rejects with the loader's error when the catalog of the locale on screen fails
again.

```tsx title="src/Account.tsx" check=group=solid-app
import { Match, Switch } from "solid-js";
import { useI18n } from "@comvi/solid";

export function Account() {
  const { t, isReady, isLoading, i18n } = useI18n("account");
  // A rejection needs no handling here: `isReady` stays false and `onError` has the report.
  const retry = () => i18n.load("account").catch(() => {});
  return (
    <Switch fallback={<button onClick={retry}>Not available. Retry</button>}>
      <Match when={isReady()}>
        <h2>{t("title")}</h2>
      </Match>
      <Match when={isLoading()}>
        <p class="spinner" />
      </Match>
    </Switch>
  );
}
```

## Load from Comvi

`cdn()` from `@comvi/core/cdn` is a `loader` that reads the catalogs your Comvi project published to
its CDN. Pass `loading` to `<I18nProvider>` to paint a placeholder until the first catalogs are in
(`<I18nProvider i18n={i18n} loading={<Spinner />}>`).

### `messages` beside `loader`

An inline catalog (`messages`, `catalogs` or `add()`) switches off loading for its own pair of
locale and namespace, and for nothing else: the loader is never asked for that pair, while other
namespaces of that locale and the same namespace in other locales still load. So do not inline a
catalog the CDN should serve. For a bundled catalog that is used when the CDN does not answer, pass
`fallback`: it is a spare, not a base that the CDN's catalog is laid over
([limit](https://comvi.io/docs/i18n/limitations#messages-and-loader)).

### Report errors with `onError`

`onError` receives every problem as an object with a `code` (`load_failed`, `missing_key` and
others) and the `locale`, `ns` and `key` it concerns. Without it, a development build prints
problems to the console and a production build prints nothing. `onError` reports and changes nothing
else: after a failed first load `i18n.ready` still resolves, the `loading` gate opens and `t()`
renders the key, so what the user sees is up to your `isReady` branch and your `catch` of
`setLocale()`.

```ts title="src/i18n.ts" check=group=solid-app
import { createI18n } from "@comvi/solid";
import { cdn } from "@comvi/core/cdn";

export const i18n = createI18n({
  locale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>", {
    // keys: "<locale>", or "<locale>:<namespace>"
    fallback: { en: () => import("./locales/en.json").then((m) => m.default) },
  }),
  onError(error) {
    if (error.code === "load_failed")
      console.error(`No catalog for ${error.locale}/${error.ns}`, error.cause);
  },
});
```

## A rejected `setLocale()`

With a `loader`, `setLocale()` loads the new locale's catalogs before it switches. When none of them
loads, the promise rejects with the loader's error, `onError` gets `load_failed`, and the locale and
the text on screen stay as they were. Calling `setLocale()` again calls the loader again.

```tsx title="src/LocaleSwitcher.tsx" check=group=solid-app
import { createSignal } from "solid-js";
import { useI18n } from "@comvi/solid";

export function LocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  const [failed, setFailed] = createSignal(false);
  const toggle = () =>
    setLocale(locale() === "en" ? "uk" : "en").then(
      () => setFailed(false),
      () => setFailed(true),
    );
  return <button onClick={toggle}>{failed() ? "Could not switch. Try again" : locale()}</button>;
}
```

## Markup in a translation

```tsx check=group=solid-app
import { T } from "@comvi/solid";

// "terms": "Read the <link>terms</link> <b>in full</b>."
export const Terms = () => (
  <T i18nKey="terms" link={(c) => <a href="/terms">{c}</a>} components={{ b: "strong" }} />
);
```

A tag renders through a prop of its name (a function that gets the tag's content), else through its
`components` entry (a tag name, a component, or `{ component, props }`), else as its inner text.
Every prop but `i18nKey`, `components`, `ns`, `locale` and `markers` is a param, and a param is
always text: a JSX element there prints as text and hydrates with a mismatch
([limit](https://comvi.io/docs/i18n/limitations#params-are-text)). `t()` takes the same handlers:
`t("terms", { link: (c) => <a href="/terms">{c}</a> })`.

## Server rendering

Create an i18n instance per request with the options the browser uses (`timeZone` is required) and
render under a `<Suspense>` boundary with `renderToStringAsync` or a stream: `useI18n(ns)` holds its
namespace for the request, and the boundary waits until its catalog is in. `renderToString` is
synchronous, so load first (`await i18n.ready`, `await i18n.load(ns)`). Embed `handover(i18n)` (an
export of `@comvi/solid`) in the page as JSON. In the browser,
`createI18n({ ...options, ...payload })` starts from the server's state: hydration matches, and the
loader is asked for nothing the server sent. A SolidStart app is in
[`examples/solidstart`](https://github.com/comvi-io/comvi-js/tree/main/examples/solidstart)
([Server-side rendering](https://comvi.io/docs/i18n/ssr)).

## Limits

[Limits](https://comvi.io/docs/i18n/limitations) lists what Comvi i18n does not do. Among its
entries:

- [`{count, number}` and `{when, date}` are not message syntax](https://comvi.io/docs/i18n/limitations#no-number-date-args): format the value with `useFormat()` from `@comvi/solid/format` and pass the result as a plain param.
- [A server payload carries every catalog the server instance holds, inline catalogs included](https://comvi.io/docs/i18n/limitations#handover-size).

Read next: the [Solid guide](https://comvi.io/docs/i18n/solid) and
[Loading translations](https://comvi.io/docs/i18n/loading-translations).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
