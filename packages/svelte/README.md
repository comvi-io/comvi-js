<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/svelte</h1>

<p align="center">Svelte 5 bindings for Comvi i18n — context, stores, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/svelte"><img src="https://img.shields.io/npm/v/@comvi/svelte?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/svelte"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/svelte?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/svelte` is the whole toolkit for a Svelte app: it bundles `@comvi/core`, so one install is
enough. There is no provider component — the host goes into Svelte's own context.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

📖 [Documentation](https://comvi.io/docs/i18n/svelte/)

## 1. Install

```bash
npm install @comvi/svelte
# Peer: svelte ^5.3.0
```

Svelte 5 only: the bindings use runes.

## 2. Quick start — an inline catalog

The smallest working app. Five things to know: `createI18n` builds the host, `locale` is what
renders now, `fallbackLocale` covers a missing key, `translation` is the catalog, and
`setI18nContext` puts the host where `useI18n()` can find it.

Runnable version: [`examples/svelte`](../../examples/svelte), which opens in
[StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/svelte) straight from the repository — see
[examples/README.md](../../examples/README.md) for the link pattern.

```svelte title="src/routes/+layout.svelte"
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import type { Snippet } from "svelte";

  const { children }: { children: Snippet } = $props();

  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    translation: {
      en: { greeting: "Hello, {name}!" },
      uk: { greeting: "Привіт, {name}!" },
    },
  });

  setI18nContext(i18n);
</script>

{@render children()}
```

```svelte title="src/routes/+page.svelte"
<script lang="ts">
  import { useI18n } from "@comvi/svelte";

  const { t, locale, setLocale } = useI18n();
</script>

<h1>{$t("greeting", { name: "Alice" })}</h1>
<select value={$locale} onchange={(e) => setLocale(e.currentTarget.value)}>
  <option value="en">English</option>
  <option value="uk">Українська</option>
</select>
```

There is no `i18n.init()` call: `setI18nContext` initializes the host itself (`autoInit`, on by
default).

`$t` is a store, so `$`-prefix it in markup. `t` and `tRaw` are both stores of the same typed-key
function — same keys, same parameter checking — and only the return type differs: `$t` renders to
a string and `$tRaw` to the parts array the rich-text path uses.

## 3. Connect to Comvi

Three questions, and the answers are the lines below.

1. **Which parser?** `compiler: icuCompiler`. The platform's catalogs use ICU plurals, and the
   default `{param}` compiler does not render them. Without `compiler: icuCompiler`, an ICU message
   (`{count, plural, …}`) throws `E_ICU_SYNTAX` in development the moment the catalog is loaded,
   before anything renders; in production it renders the message text literally and reports the
   error through `onError` (`console.error` when no handler is set).
2. **Where from?** `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn`, which
   fetches the catalog at runtime instead of bundling it.
3. **What to paint meanwhile?** `isInitializing`, in the component that owns the children. The
   catalog is in flight during the first paint now, and Svelte has no provider component and no
   `fallback` prop, so the gate is three lines of markup.

```bash
npm install @comvi/plugin-fetch-loader
```

```svelte title="src/routes/+layout.svelte"
<script lang="ts">
  import { createI18n, icuCompiler, setI18nContext } from "@comvi/svelte";
  import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
  import type { Snippet } from "svelte";

  const { children }: { children: Snippet } = $props();

  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    compiler: icuCompiler,
  }).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

  setI18nContext(i18n);
</script>

{@render children()}
```

```svelte title="src/routes/+page.svelte"
<script lang="ts">
  import { useI18n } from "@comvi/svelte";

  const { isInitializing, t } = useI18n();
</script>

{#if $isInitializing}
  <div class="spinner"></div>
{:else}
  <h1>{$t("greeting", { name: "Alice" })}</h1>
{/if}
```

The catalogs now come from the platform, so `$t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

`$isLoading` is the other axis: it goes true again for every later namespace or locale load, where
the UI usually stays up rather than being replaced.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and copy it from
**Settings → Content Deploy → CDN Endpoint** (the URL is generated when Content Deploy is enabled and saved). Compose before `init()` — `setI18nContext` calls it for you, so compose in
the `createI18n` expression as above.

That init runs in a microtask, so nothing in the component can await it. To see a failure, pass
`onError`:

```ts
import { createI18n, setI18nContext } from "@comvi/svelte";

const i18n = createI18n({ locale: "en" });

setI18nContext(i18n, { onError: (error) => console.error("[i18n]", error) });
```

The host's own `onError` (the `createI18n({ onError })` option) reports the failure first; this one
is the per-app hook, matching the `onError` prop on the react and solid providers.

## 4. Svelte API reference

### `setI18nContext(i18n, options?)`

Puts the host into Svelte's context, where every descendant's `useI18n()` finds it. Options:
`autoInit` (default `true`) and `onError`. There is no component to render and no props to pass.

### `useI18n()`

Returns the translation bag every host can serve: `{ t, tRaw, locale, getTranslationCache,
cacheRevision, isLoading, isInitializing, isInitialized, setLocale, ... }` plus the four `Intl`
formatters. The same member names as `@comvi/react`, `@comvi/solid` and `@comvi/vue`, so a component
reads alike across bindings. The reactive members are stores; `$`-prefix them.

One member is not the same everywhere: the cache is a getter here,
`getTranslationCache()`, where `@comvi/react` and `@comvi/vue` expose `translationCache`
directly.

It does **not** carry the loader or plugin members — see the capability APIs below.

`useI18n("admin")` binds the namespace at the type level too: with generated keys, `$t("dashboard")`
is exact for `admin:dashboard`, and a key from another namespace is rejected, through core's
`NamespaceBoundTranslateFn` shared by all four bindings.

The four formatters are **not** stores: they are plain functions that read `i18n.locale` once per
call. Put the call where the locale is already tracked (a `$derived`, or the markup) or pass the
locale yourself. `dir` IS a `derived` store.
[docs/design/formatting.md](../../docs/design/formatting.md) has the cross-binding table.

### Store factories

Seven of them, for a component that follows one axis and no other:

- Read-only: `createLocaleStore`, `createLoadingStore`, `createInitializingStore`,
  `createInitializedStore`, `createCacheRevisionStore`.
- Writable: `createDefaultNamespaceStore` (`$store = "admin"` writes through to
  `setDefaultNamespace`) and `createDefaultParamsStore` (the same, through `setDefaultParams`).

Every setter writes THROUGH to the host, which stays the source of truth.

### `useI18nHost()`

Returns the bare host the nearest `setI18nContext` ancestor provided — the same name in
`@comvi/react` and `@comvi/solid` (vue's equivalent is `inject(I18N_INJECTION_KEY).core`). A context
reader, so callable during component initialisation only, and not a store.

```svelte
<script lang="ts">
  import { useI18nHost } from "@comvi/svelte";

  const host = useI18nHost();
  const loaded = host.getLoadedLocales().join(", ");
</script>

<pre>{loaded}</pre>
```

`getI18nContext()` is the deprecated spelling of the same reader: this package's rule is `useI18n*`,
not `getI18n*`, so one grep finds the API in all three bindings.

### `useI18nLoader()` and `useI18nPlugins()`

Async loading and the plugin host are **capabilities**: things the host has only once you compose
them. You acquire their members explicitly rather than getting them from `useI18n()`.

```svelte
<script lang="ts">
  import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/svelte";

  const { t } = useI18n("admin");
  const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
    useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
</script>
```

They are **context readers, not stores**: like `useI18n()` they call `useI18nHost()`, so they are
callable during component initialisation only, and what they return is a plain object of bound
functions. Do not `$`-prefix a member. They differ from the store factories because a capability
action is an imperative operation rather than a value that changes over time. Neither takes
parameters; the namespace argument stays on `useI18n(ns)`.

On a host that never composed the capability the acquisition call throws, in development **and**
production, never a silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).
```

That is the development message. A production build throws the short form,
`[comvi] missing loader capability — attach @comvi/core/loader`, so grep for that one in
production logs.

### Rich text with `<T>`

Embed components inside a translation without raw HTML and without splitting the sentence across
template fragments. Translators see clean markup; the `components` prop decides what each tag
renders to. Svelte's shape is **a tag name, a Svelte component, or a `{ tag, props }` config**.

```json
{
  "help": "For support, <link>visit our docs</link> or <bold>email us</bold>.",
  "legal": "See our <policy>privacy policy</policy>."
}
```

```svelte
<script lang="ts">
  import { T } from "@comvi/svelte";
</script>

<T
  i18nKey="help"
  components={{
    link: "a",
    bold: "strong",
    policy: { tag: "a", props: { href: "/privacy" } },
    // btn: FancyButton — a Svelte component receives the tag content as its `children` snippet
  }}
/>
```

`<T>` renders the translation **structurally**: real DOM nodes built from the parsed translation
tree, with no HTML-string sink. Translators can only ever produce text and the tags you map; a tag
without a mapping falls back to its inner text. A map built outside the markup is typed as
`ComponentMap` (the same name in all four bindings). Pass `tagInterpolation: { strict: "warn" }` to
`createI18n` to catch translations referencing tags you forgot to handle before they ship.

`<T skipPostProcess>` skips post-processors for that one call — notably the in-context editor's
invisible markers. `raw` is the same prop under its old 0.4 name: it still works, warns once in
development, and is removed in 0.6. Rename it by hand in Svelte template markup.

`<T>` never changes what `t()` does with `<b>` markup — it renders through the pure
`@comvi/core/rich-text` path. Making `t()` itself parse tags is a separate opt-in:
`import "@comvi/core/tags"` once, which registers the grammar process-wide. Until then
`t("Click <b>here</b>")` hands that markup back as text and development warns once per template.

### Reference: composing by hand

`@comvi/svelte` re-exports core's capability installers **by name**, so an app names one package and
the ones you never call are pruned from your bundle: `createI18n`, `icuCompiler`, `loader`,
`attachLoader`, `plugins`, `definePlugin`, `devtools`, and `I18n` as a type. There is no
svelte-side wrapper object: the host goes straight into `setI18nContext(i18n)`, so the constructor
IS core's own `createI18n`, re-exported by name.

`loader(map)` attaches the loader capability **and** registers the map, so it needs its map; a bare
`loader()` is a compile error. For a plain loader function, compose `attachLoader` and register it
yourself, which also keeps the import-map adapter out of your bundle:

```ts
import { attachLoader, createI18n } from "@comvi/svelte";

const i18n = createI18n({ locale: "en" }).use(attachLoader);
i18n.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

Your own inline plugin goes in through `definePlugin`, which composes the plugin host and registers
the function in one call. Browser-extension discovery is `devtools({ instanceId })`. The low-level
`attachPlugins` / `attachDevtools` pair is not re-exported here; import it from
`@comvi/core/plugins` / `@comvi/core/devtools`.

Full reasoning: [docs/design/composition.md](../../docs/design/composition.md).

## 5. Server-side rendering (SvelteKit)

**Create a per-request instance. Never share a module-level singleton across requests**, or one
user's locale bleeds into another's response. This is the opposite of the rule `@comvi/next`
follows.

A `load` function's return value crosses the server→client boundary and is serialized with
`devalue`, so it must **not** return the host itself: a class instance cannot be serialized and
SvelteKit throws. Return plain data and build the host in the component, which runs once per request
on the server and once on the client.

```ts title="src/routes/+layout.ts"
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ fetch }) => {
  const locale = "en";
  // Plain JSON, safe to serialize to the client.
  const messages = await fetch(`https://cdn.comvi.io/your-distribution-id/${locale}.json`).then(
    (r) => r.json(),
  );
  return { locale, messages };
};
```

```svelte title="src/routes/+layout.svelte"
<script lang="ts">
  import { createI18n, setI18nContext } from "@comvi/svelte";
  import type { TranslationValue } from "@comvi/core";
  import type { Snippet } from "svelte";

  let { data, children }: {
    data: { locale: string; messages: Record<string, TranslationValue> };
    children: Snippet;
  } = $props();

  // Seeded synchronously, so translations are ready before the first render: no flash
  // and no hydration mismatch. The auto-init microtask would not complete in time.
  const i18n = createI18n({
    locale: data.locale,
    translation: { [data.locale]: data.messages },
  });

  setI18nContext(i18n);
</script>

{@render children()}
```

Child components call `useI18n()` as normal, and the context carries the per-request instance.

Want the runtime CDN loader for client navigation as well? Keep the per-request
`createI18n(...).use(cdnLoader(...))` here and `await i18n.init()` inside an `$effect` / `onMount`
for the client, while still seeding `translation` from `load` data for the initial server render.
The rule is the same: only serializable data crosses `load`.

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

Measured min+gz through the package's published entry, with `svelte` left out of the bundle, and
checked in CI against [`scripts/size-budgets.json`](../../scripts/size-budgets.json) with 5 % of
headroom. CI also reads the modules each bundle actually pulled in, so "a capability you never
import costs nothing" is checked rather than asserted.

| app shape                             | measured as                | min+gz  | checked to contain none of                           |
| ------------------------------------- | -------------------------- | ------- | ---------------------------------------------------- |
| base host + bindings, no `<T>`        | `fw-svelte-default`        | 6700 B  | ambient tags, or any of the four capability subpaths |
| every capability composed, with `<T>` | `fw-svelte-full-composite` | 11716 B | ambient tag registration                             |

## 8. Where to go next

- **Loading from the platform:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) for API mode,
  namespace layout and offline fallbacks.
- **Design notes:** [composition](../../docs/design/composition.md) ·
  [ICU](../../docs/design/icu.md) · [rich text](../../docs/design/rich-text.md) ·
  [formatting](../../docs/design/formatting.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **Upgrading from 0.4.x:** the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md), whose
  §2 tables every hook rename and §3 the per-binding changes.
- **Full API:** [comvi.io/docs/i18n/svelte/](https://comvi.io/docs/i18n/svelte/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
