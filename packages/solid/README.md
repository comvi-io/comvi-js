<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/solid</h1>

<p align="center">SolidJS bindings for Comvi i18n — provider, reactive primitives, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/solid"><img src="https://img.shields.io/npm/v/@comvi/solid?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/solid"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/solid?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/solid` is the whole toolkit for a SolidJS app: it bundles `@comvi/core`, so one install is
enough. Translations are signals, so a locale change updates only what read it.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

Server-side **loading** is not supported yet — see [Server-side rendering](#5-server-side-rendering)
before you plan an SSR app.

📖 [Documentation](https://comvi.io/docs/i18n/solid/)

## 1. Install

```bash
npm install @comvi/solid
# Peer: solid-js ^1.8.0
```

## 2. Quick start — an inline catalog

The smallest working app. Five things to know: `createI18n` builds the host, `locale` is what
renders now, `fallbackLocale` covers a missing key, `translation` is the catalog, and
`<I18nProvider>` puts the host where `useI18n()` can find it.

Runnable version: [`examples/solid`](../../examples/solid), which opens in
[StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/solid) straight from the repository — see
[examples/README.md](../../examples/README.md) for the link pattern.

```tsx title="src/index.tsx"
import { render } from "solid-js/web";
import { createI18n, I18nProvider } from "@comvi/solid";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
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

```tsx title="src/App.tsx"
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

There is no `i18n.init()` call: `<I18nProvider>` initializes the host itself (`autoInit`, on by
default).

**Call `t()` inside a tracking scope.** `t()` and `tRaw()` read the locale and cache signals at call
time, so they stay reactive only when invoked inside JSX, a `createMemo` or a `createEffect`.
Reading the value once into a plain variable captures it forever.

## 3. Connect to Comvi

Two additions to the host, and nothing else changes:

1. **`compiler: icuCompiler`.** The platform's catalogs use ICU plurals. Without the compiler an ICU
   message throws in development and renders literally in production, so name it once here and it
   covers every catalog the host ever ingests.
2. **`.use(cdnLoader({ cdnUrl }))`** from `@comvi/plugin-fetch-loader/cdn`, which fetches the
   catalog at runtime instead of bundling it.

The catalog is now in flight during the first paint, so pass a **`fallback`** to gate it.

```bash
npm install @comvi/plugin-fetch-loader
```

```tsx title="src/index.tsx"
import { render } from "solid-js/web";
import { createI18n, icuCompiler, I18nProvider } from "@comvi/solid";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

render(
  () => (
    <I18nProvider i18n={i18n} fallback={<div class="spinner" />}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("root")!,
);
```

The catalogs now come from the platform, so `t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and read it off the
**Distributions** page. Compose before `init()` — `<I18nProvider>` calls it for you, so compose in
the `createI18n` expression as above.

## 4. SolidJS API reference

### `<I18nProvider>` props

| prop        | type                     | what it does                                               |
| ----------- | ------------------------ | ---------------------------------------------------------- |
| `i18n`      | the host                 | required                                                   |
| `children`  | `JSX.Element`            | required                                                   |
| `autoInit`  | `boolean`                | calls `i18n.init()` for you; default `true`                |
| `fallback`  | `JSX.Element`            | rendered instead of children until the host is initialized |
| `ssrLocale` | `string`                 | the locale the server render paints in                     |
| `onError`   | `(error: Error) => void` | initialization failures                                    |

**`fallback` gates on `isInitialized`, not `isInitializing`.** Auto-init starts from an effect, after
the tree is built, so a gate on "is it initializing" is open for exactly the paint the raw keys would
appear in. With `autoInit: false` the fallback stays until your app calls `i18n.init()` itself. Both
branches render inside the provider, so the fallback may call `useI18n()`. Omit the prop and children
render throughout.

During `renderToString` no effect runs and nothing initializes the host, so the fallback is what the
server paints and what hydration reuses until client init resolves. An SSR page whose catalog is
already inline has nothing to wait for and wants no `fallback`.

### `useI18n()`

Returns the translation bag every host can serve: `{ t, tRaw, locale, getTranslationCache,
cacheRevision, isLoading, isInitializing, isInitialized, setLocale, ... }` plus the four `Intl`
formatters. The same member names as `@comvi/react`, `@comvi/svelte` and `@comvi/vue`, so a
component reads alike across bindings. Accessors are signals; call them.

One member is not the same everywhere: the cache is a getter here,
`getTranslationCache()`, where `@comvi/react` and `@comvi/vue` expose `translationCache`
directly.

It does **not** carry the loader or plugin members — see the capability APIs below.

`useI18n("admin")` binds the namespace at the type level too: with generated keys, `t("dashboard")`
is exact for `admin:dashboard`, and a key from another namespace is rejected, through core's
`NamespaceBoundTranslateFn` shared by all four bindings.

The four formatters are **not** reactive here: they call core with the host and read no signal.
Put the call inside a `createMemo` or the template, or pass the locale yourself. `dir` is reactive.
[docs/design/formatting.md](../../docs/design/formatting.md) has the cross-binding table.

### Reactive primitives

Two names, one rule: **`create*Signal` reads, `create*State` reads and writes.**

A `Signal` primitive returns an `Accessor` that mirrors the host, on all seven axes:
`createLocaleSignal`, `createDefaultNamespaceSignal`, `createDefaultParamsSignal`,
`createLoadingSignal`, `createInitializingSignal`, `createInitializedSignal`,
`createCacheRevisionSignal`.

A `State` primitive returns `[accessor, setter]` for the two axes a host lets you write:
`createDefaultNamespaceState` (its setter calls `setDefaultNamespace`) and
`createDefaultParamsState` (`setDefaultParams`). Every setter writes THROUGH to the host, which
stays the source of truth.

### `useI18nHost()`

Returns the bare host the nearest `<I18nProvider>` holds — the same name in `@comvi/react` and
`@comvi/svelte` (vue's equivalent is `inject(I18N_INJECTION_KEY).core`). It is not a signal: read it
for an imperative call, and use `useI18n()` or a primitive when the view must follow the host.

```tsx
import { useI18nHost } from "@comvi/solid";

function Debug() {
  const host = useI18nHost();
  return <pre>{host.getLoadedLocales().join(", ")}</pre>;
}
```

`useI18nContext()` is the deprecated spelling of the same reader.

### `useI18nLoader()` and `useI18nPlugins()`

Async loading and the plugin host are **capabilities**: things the host has only once you compose
them. You acquire their members explicitly rather than getting them from `useI18n()`.

```tsx
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/solid";

function Namespaces() {
  const { t } = useI18n("admin");
  const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
    useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
  // …
}
```

They are plain accessors under the provider, **not signals**: a capability action is an imperative
operation, not a reactive value. Neither takes parameters; the namespace argument stays on
`useI18n(ns)`. What they return is referentially stable per host instance. On a host that never
composed the capability the acquisition call throws, in development **and** production, never a
silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).
```

That is the development message. A production build throws the short form,
`[comvi] missing loader capability — attach @comvi/core/loader`, so grep for that one in
production logs.

### Rich text with `<T>`

Embed components inside a translation without raw HTML and without splitting the sentence across
template fragments. Translators see clean markup; the `components` prop decides what each tag
renders to. Solid's shape is **a function per tag**, which receives the tag's content as `children`
— a function rather than a Solid component, which avoids Solid's conditional branch caching pitfall.

```json
{
  "help": "For support, <link>visit our docs</link> or <bold>email us</bold>.",
  "privacy": "We take privacy seriously. <policy>Read our policy</policy>."
}
```

```tsx
import { T } from "@comvi/solid";

function Help() {
  return (
    <T
      i18nKey="help"
      components={{
        link: ({ children }) => <a href="/docs">{children}</a>,
        bold: ({ children }) => <strong>{children}</strong>,
      }}
    />
  );
}
```

A plain HTML tag name works too: `<T i18nKey="privacy" components={{ policy: "a" }} />` renders
`<a>Read our policy</a>`.

A map built outside the JSX is typed as `ComponentMap` (the same name in all four bindings). Pass
`tagInterpolation: { strict: "warn" }` to `createI18n` to catch translations referencing tags you
forgot to handle before they ship.

`<T skipPostProcess>` skips post-processors for that one call — notably the in-context editor's
invisible markers. `raw` is the same prop under its old 0.4 name: it still works, warns once in
development, and is removed in 0.6; a
[codemod](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md#3-the-codemod) rewrites it.

`<T>` never changes what `t()` does with `<b>` markup — it renders through the pure
`@comvi/core/rich-text` path. Making `t()` itself parse tags is a separate opt-in:
`import "@comvi/core/tags"` once, which registers the grammar process-wide. Until then
`t("Click <b>here</b>")` hands that markup back as text and development warns once per template.

### Reference: composing by hand

`@comvi/solid` re-exports core's capability installers **by name**, so an app names one package and
the ones you never call are pruned from your bundle: `createI18n`, `icuCompiler`, `loader`,
`attachLoader`, `plugins`, `definePlugin`, `devtools`, and `I18n` as a type.

`loader(map)` attaches the loader capability **and** registers the map, so it needs its map; a bare
`loader()` is a compile error. For a plain loader function, compose `attachLoader` and register it
yourself, which also keeps the import-map adapter out of your bundle:

```tsx
import { attachLoader, createI18n } from "@comvi/solid";

const i18n = createI18n({ locale: "en" }).use(attachLoader);
i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

Your own inline plugin goes in through `definePlugin`, which composes the plugin host and registers
the function in one call. Browser-extension discovery is `devtools({ instanceId })`. The low-level
`attachPlugins` / `attachDevtools` pair is not re-exported here; import it from
`@comvi/core/plugins` / `@comvi/core/devtools`.

Full reasoning: [docs/design/composition.md](../../docs/design/composition.md).

## 5. Server-side rendering

**Build the host inside the request handler.** Adopting `ssrLocale` is a WRITE to `i18n.locale`, and
`renderToString` runs it in the server process: a host at module scope, shared by every concurrent
request, would carry one request's locale into another's tree. This is the opposite of the rule
`@comvi/next` follows.

**Server-side loading is not supported yet.** `<I18nProvider>` calls `init()` from a `createEffect`
(the `createEffect` inside `I18nProvider`, `packages/solid/src/context.tsx`), and effects do not run during Solid's server render. So a
catalog a loader would have fetched is absent server-side and `isInitialized()` is `false` there.
Keep the catalog inline for the server render, or load on the client and gate with `fallback`.
[Track progress in the issues](https://github.com/comvi-io/comvi-js/issues).

```tsx title="src/entry-server.tsx"
import { renderToString } from "solid-js/web";
import { createI18n, I18nProvider, icuCompiler } from "@comvi/solid";
import en from "./locales/en.json";
import uk from "./locales/uk.json";
import App from "./App";

export function render(locale: string) {
  const i18n = createI18n({
    locale,
    compiler: icuCompiler,
    translation: { "en:default": en, "uk:default": uk },
  });

  return renderToString(() => (
    <I18nProvider i18n={i18n} ssrLocale={locale}>
      <App />
    </I18nProvider>
  ));
}
```

Pass `ssrLocale` on the client too. Without it the client keeps its own locale, the hydrated markup
stays in the server's locale until the first reactive update, and then the text flips. On the client
there is one request and nothing to leak, so the usual module-scope host is fine there.

The four frameworks' module-scope rules side by side:
[docs/design/ssr.md](../../docs/design/ssr.md). The cross-framework SSR guide on the site is at
[comvi.io/docs/i18n/guides/ssr/](https://comvi.io/docs/i18n/guides/ssr/).

## 6. Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key. One
augmentation serves every binding, generated by [`@comvi/cli`](../cli) from the platform or
[`@comvi/vite-plugin`](../vite-plugin) from local JSON. The declaration, the examples and what
TypeScript catches are in the
[root README](https://github.com/comvi-io/comvi-js#typed-translation-keys).

## 7. What it weighs

Measured min+gz through the package's published entry, with `solid-js` left out of the bundle, and
checked in CI against [`scripts/size-budgets.json`](../../scripts/size-budgets.json) with 5 % of
headroom. CI also reads the modules each bundle actually pulled in, so "a capability you never
import costs nothing" is checked rather than asserted.

| app shape                             | measured as               | min+gz  |
| ------------------------------------- | ------------------------- | ------- |
| base host + bindings, no `<T>`        | `fw-solid-default`        | 6591 B  |
| every capability composed, with `<T>` | `fw-solid-full-composite` | 11135 B |

## 8. Where to go next

- **Loading from the platform:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) for API mode,
  namespace layout and offline fallbacks.
- **Design notes:** [composition](../../docs/design/composition.md) ·
  [ICU](../../docs/design/icu.md) · [rich text](../../docs/design/rich-text.md) ·
  [formatting](../../docs/design/formatting.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **Upgrading from 0.4.x:** the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md), whose
  §3 has the codemod recipe — it is a repo-internal script, run by absolute path from your app's
  root, not a `pnpm` script you have.
- **Full API:** [comvi.io/docs/i18n/solid/](https://comvi.io/docs/i18n/solid/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
