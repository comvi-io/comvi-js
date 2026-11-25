<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/svelte</h1>

<p align="center">Svelte 5 bindings for Comvi i18n: <code>setI18n()</code>, <code>useI18n()</code> and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/svelte"><img src="https://img.shields.io/npm/v/@comvi/svelte?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/svelte"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/svelte` is the Svelte 5 binding of Comvi i18n: `setI18n()`, `useI18n()` and the `<T>`
component, built on runes. Create the i18n instance, pass it to `setI18n()` in the root component,
and read translations in any component below it.

## Install

```bash
npm install @comvi/svelte @comvi/core # peer: svelte ^5.3.0
```

`@comvi/core` and every binding in an app must be on one version: two copies of `@comvi/core` (two
versions, or one version installed twice) throw an error that names both versions.

## Setup

```ts title="src/i18n.ts" check=group=svelte-app
import { createI18n } from "@comvi/svelte";

export const i18n = createI18n({
  locale: "en",
  messages: { en: { greeting: "Hello, {name}!" }, uk: { greeting: "Привіт, {name}!" } },
});
```

```svelte title="src/App.svelte" check=group=svelte-app
<script lang="ts">
  import { setI18n, useI18n } from "@comvi/svelte";
  import { i18n } from "./i18n";

  setI18n(i18n);
  const r = useI18n();
  const t = r.t;
</script>

<button onclick={() => r.setLocale(r.locale === "en" ? "uk" : "en")}>
  {t("greeting", { name: "Alice" })}
</button>
```

`t()` fills `{name}` from its second argument. `locale`, `dir`, `isReady` and `isLoading` are
getters: read them through the object (`r.locale`), because a destructured one is read once. Both
catalogs are inline, so the switch loads nothing; with a `loader`, `setLocale()` can reject: see
[A rejected `setLocale()`](#a-rejected-setlocale).

## Typed keys

Typed keys come from JSON catalogs: `src/locales/<locale>.json` is the `default` namespace,
`src/locales/<namespace>/<locale>.json` the others. Install `@comvi/vite-plugin` as a dev dependency
and add `comviTypes({ from: "./src/locales", sourceLocale: "en" })` to the `plugins` of
`vite.config.ts`. `vite dev` and `vite build` then write `src/types/i18n.d.ts`; keep it inside the
`include` of your `tsconfig.json`. For `{ "greeting": "Hello, {name}!" }` in `src/locales/en.json`
the file reads, after a header comment:

<!-- prettier-ignore -->
```ts title="src/types/i18n.d.ts" check=group=svelte-typed
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

From then on, a key that is not in the catalog is a type error that `svelte-check` reports:

```svelte title="src/Greeting.svelte" check=group=svelte-typed check=expect-error
<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  const t = useI18n().t;
</script>

<!-- "greting" is not a key -->
<h1>{t("greting", { name: "Alice" })}</h1>
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

```svelte title="src/Account.svelte" check=group=svelte-app
<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  const account = useI18n("account");
  // A rejection needs no handling here: `isReady` stays false and `onError` has the report.
  const retry = () => account.i18n.load("account").catch(() => {});
</script>

{#if account.isReady}<h2>{account.t("title")}</h2>
{:else if account.isLoading}<p class="spinner"></p>
{:else}<button onclick={retry}>Not available. Retry</button>{/if}
```

## Load from Comvi

`cdn()` from `@comvi/core/cdn` is a `loader` that reads the catalogs your Comvi project published to
its CDN. Nothing gates the first paint: mount the app after `i18n.ready` resolves, or branch on
`isReady` in the root component.

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
else: after a failed first load `i18n.ready` still resolves and `t()` renders the key, so what the
user sees is up to your `isReady` branch and your `catch` of `setLocale()`.

```ts title="src/i18n.ts" check=group=svelte-cdn
import { createI18n } from "@comvi/svelte";
import { cdn } from "@comvi/core/cdn";
import en from "./locales/en.json";

export const i18n = createI18n({
  locale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>", {
    fallback: { en: () => en }, // keys: "<locale>", or "<locale>:<namespace>"
  }),
  onError(error) {
    if (error.code === "load_failed")
      console.error(`No catalog for ${error.locale}/${error.ns}`, error.cause);
  },
});
```

```ts title="src/main.ts" check=group=svelte-cdn
import { mount } from "svelte";
import App from "./App.svelte";
import { i18n } from "./i18n";

i18n.ready.then(() => mount(App, { target: document.body }));
```

## A rejected `setLocale()`

With a `loader`, `setLocale()` loads the new locale's catalogs before it switches. When none of them
loads, the promise rejects with the loader's error, `onError` gets `load_failed`, and the locale and
the text on screen stay as they were. Calling `setLocale()` again calls the loader again.

```svelte title="src/LocaleSwitcher.svelte" check=group=svelte-app
<script lang="ts">
  import { useI18n } from "@comvi/svelte";
  const r = useI18n();
  let failed = $state(false);
  const toggle = () =>
    r.setLocale(r.locale === "en" ? "uk" : "en").then(
      () => (failed = false),
      () => (failed = true),
    );
</script>

<button onclick={toggle}>{failed ? "Could not switch. Try again" : r.locale}</button>
```

## Markup in a translation

```svelte check=group=svelte-app
<script lang="ts">
  import { T } from "@comvi/svelte";
</script>

<!-- "terms": "Read the <link>terms</link> <b>in full</b>." -->
<T i18nKey="terms" components={{ b: "strong" }}>
  {#snippet link(children: string)}<a href="/terms">{children}</a>{/snippet}
</T>
```

A tag renders through its `components` entry (a tag name, a component, or `{ component, props }`),
else through a snippet of its name (`children` is the tag's text), else as its inner text. Every
prop but `i18nKey`, `components`, `ns`, `locale` and `markers` is a param, and a param is always
text ([limit](https://comvi.io/docs/i18n/limitations#params-are-text)). `t()` returns a string: with
typed keys, a key whose message has tags is a type error in `t()`, and `<T>` renders it.

## Server rendering

Create an i18n instance per request with the options the browser uses (`timeZone` is required).
`render()` of `svelte/server` is synchronous, so load what the page shows first: `await i18n.ready`,
then `await i18n.load(ns)` for each namespace. Return `handover(i18n)` (an export of
`@comvi/svelte`) to the page as data. In the browser,
`setI18n(createI18n({ ...options, ...payload }))` starts from the server's state: hydration matches,
and the loader is asked for nothing the server sent. A SvelteKit app is in
[`examples/sveltekit`](https://github.com/comvi-io/comvi-js/tree/main/examples/sveltekit)
([Server-side rendering](https://comvi.io/docs/i18n/ssr)).

## Limits

[Limits](https://comvi.io/docs/i18n/limitations) lists what Comvi i18n does not do. Among its
entries:

- [`{count, number}` and `{when, date}` are not message syntax](https://comvi.io/docs/i18n/limitations#no-number-date-args): format the value with `useFormat()` from `@comvi/svelte/format` and pass the result as a plain param.
- [A server payload carries every catalog the server instance holds, inline catalogs included](https://comvi.io/docs/i18n/limitations#handover-size).

Read next: the [Svelte guide](https://comvi.io/docs/i18n/svelte) and
[Loading translations](https://comvi.io/docs/i18n/loading-translations).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
