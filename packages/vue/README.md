<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vue</h1>

<p align="center">Vue 3 bindings for Comvi i18n — one plugin, composables, and the <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vue"><img src="https://img.shields.io/npm/v/@comvi/vue?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/vue"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/vue?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/vue` is the whole toolkit for a Vue 3 app: it bundles `@comvi/core`, so one install is
enough. `useI18n()` returns refs and computeds, so a locale or catalog change triggers precise
re-renders. One `app.use(i18n)` covers the Composition API, the Options API and templates.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()` — on this package
that is a `VueI18n` wrapper, and the bare core host it wraps is public as `i18n.core`.

📖 [Documentation](https://comvi.io/docs/i18n/vue/)

## 1. Install

```bash
npm install @comvi/vue
# Peer: vue ^3.0.0
```

## 2. Quick start — an inline catalog

The smallest working app. Five things to know: `createI18n` builds the host, `locale` is what
renders now, `fallbackLocale` covers a missing key, `translation` is the catalog, and
`app.use(i18n)` installs it so `useI18n()` can find it.

Runnable version: [`examples/vue`](../../examples/vue), which opens in
[StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vue) straight from the repository — see
[examples/README.md](../../examples/README.md) for the link pattern.

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createApp(App).use(i18n).mount("#app");
```

```vue title="src/App.vue"
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t, locale, setLocale } = useI18n();
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
  <select :value="locale" @change="setLocale(($event.target as HTMLSelectElement).value)">
    <option value="en">English</option>
    <option value="uk">Українська</option>
  </select>
</template>
```

There is no `i18n.init()` call: `app.use(i18n)` initializes the host itself.

`app.use(i18n)` is Vue's own plugin verb and has nothing to do with comvi's `.use(installer)`
composition pipe below — the two share a name and take different arguments.

## 3. Connect to Comvi

Two additions to the host, and nothing else changes:

1. **`compiler: icuCompiler`.** The platform's catalogs use ICU plurals. Without the compiler an ICU
   message throws in development and renders literally in production, so name it once here and it
   covers every catalog the host ever ingests.
2. **`.use(cdnLoader({ cdnUrl }))`** from `@comvi/plugin-fetch-loader/cdn`, which fetches the
   catalog at runtime instead of bundling it.

The catalog is now in flight during the first paint. Vue has no `fallback` prop, so the gate is
**three lines of template** in the component that owns the children.

```bash
npm install @comvi/plugin-fetch-loader
```

```ts title="src/main.ts"
import { createApp } from "vue";
import { createI18n, icuCompiler } from "@comvi/vue";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

createApp(App).use(i18n).mount("#app");
```

```vue title="src/App.vue"
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t, isInitializing } = useI18n();
</script>

<template>
  <div v-if="isInitializing" class="spinner" />
  <h1 v-else>{{ t("greeting", { name: "Alice" }) }}</h1>
</template>
```

The catalogs now come from the platform, so `t("items", { count: 5 })` renders a locale-correct
plural from `"{count, plural, one {# item} other {# items}}"`.

`isLoading` is the other axis: it goes true again for every later namespace or locale load, where
the UI usually stays up rather than being replaced.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and read it off the
**Distributions** page. **Compose before `app.use(i18n)`**, which is what the chain above does — it
is the one ordering rule this package adds.

## 4. Vue API reference

### `createI18n(options)` and the `.use(installer)` chain

`createI18n` returns a `VueI18n`: the Vue plugin, the reactive layer, and a public `core` holding the
bare host. `.use(installer)` on that result runs the installer on `i18n.core`, hands back the same
`VueI18n`, and **widens the type of `core`** by what was composed:

```ts
import { createI18n, loader, plugins } from "@comvi/vue";

const i18n = createI18n({ locale: "en" })
  .use(loader({ uk: () => import("./uk.json") }))
  .use(plugins());

i18n.core.reloadTranslations(); // typed: `.use` widened `core`
```

Reaching one level down instead, as `createI18n(options).core.use(…)`, still attaches the capability
at runtime, but does not re-type the wrapper: `i18n.core` keeps the base type and every later
`i18n.core.registerLoader(…)` is a compile error. Use the wrapper pipe above.

`createI18nFromCore(core, options?)` wraps a host built somewhere else, preserving its exact type as
`i18n.core` — for Nuxt's `hostModule`, or one host shared between a Vue app and non-Vue code.
`.use(…)` works on the result too. The host itself comes from `createI18n` in `@comvi/core`; this
package publishes no `createCore` alias.

```ts
import { createI18n as createCoreHost } from "@comvi/core";
import { createI18nFromCore, loader } from "@comvi/vue";

const host = createCoreHost({ locale: "en" }).use(loader({ uk: () => import("./uk.json") }));
const i18n = createI18nFromCore(host, { ssrLocale: "en" });
```

### `useI18n()`

Returns the translation bag every host can serve: `{ t, tRaw, locale, translationCache,
cacheRevision, isLoading, isInitializing, isInitialized, setLocale, ... }` plus the four `Intl`
formatters. The same member names as `@comvi/react`, `@comvi/solid` and `@comvi/svelte`, so a
component reads alike across bindings. The reactive members are refs, unwrapped automatically in
templates.

One member is not the same everywhere: `translationCache` is a direct member here and in
`@comvi/react`, while `@comvi/solid` and `@comvi/svelte` expose it as a getter,
`getTranslationCache()`.

It does **not** carry the loader or plugin members — see the capability composables below.

`useI18n("admin")` binds the namespace at the type level too: with generated keys, `t("dashboard")`
is exact for `admin:dashboard`, and a key from another namespace is rejected.

The four formatters ARE reactive here: they default to the reactive `locale` ref, and `dir` is a
`ComputedRef`. [docs/design/formatting.md](../../docs/design/formatting.md) has the cross-binding
table, because Svelte and Solid answer this differently.

The bag does not include `hasTranslationNow` / `hasLocaleNow`: `hasTranslation` and `hasLocale`
already ARE the non-reactive form in the other three bindings, so the imperative pair would have
been two vue-only names for one thing. They stay on the class, as
`inject(I18N_INJECTION_KEY)!.hasTranslationNow(key, opts?)`.

### Options API and templates

`app.use(i18n)` also installs `$t`, `$tRaw` and `$i18n` as global properties, so an Options API
component or a plain template needs no import: `{{ $t("greeting", { name }) }}`. `$i18n` is the
ambient host, so `{{ $i18n.locale }}` and `$i18n.setLocale("uk")` work from a template too; note `$i18n.locale` is a `Ref<string>`, so a binding or script code reads `.value`. `$tRaw`
is the parts-array half of `$t`.

### The bare host: `inject(I18N_INJECTION_KEY).core`

React, solid and svelte spell "give me the host" `useI18nHost()`. Vue has no fourth spelling: the
injected `VueI18n` already carries the host as `core`, so the equivalent is the injection key.

```vue
<script setup lang="ts">
import { inject } from "vue";
import { I18N_INJECTION_KEY } from "@comvi/vue";

const host = inject(I18N_INJECTION_KEY)!.core;
const loaded = host.getLoadedLocales().join(", ");
</script>
```

The host is seen as the bare core there; capability calls go through the composables below.

### `useI18nLoader()` and `useI18nPlugins()`

Async loading and the plugin host are **capabilities**: things the host has only once you compose
them. You acquire their members explicitly rather than getting them from `useI18n()`.

```vue
<script setup lang="ts">
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/vue";

const { t } = useI18n("admin");
const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
  useI18nLoader();
const { onMissingKey } = useI18nPlugins();
</script>
```

Neither takes parameters; the namespace argument stays on `useI18n(ns)`. What they return is
referentially stable per host instance, keyed on the core, so two `VueI18n` wrappers over one host
share it. On a host that never composed the capability the acquisition call throws, in development
**and** production, never a silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).
```

That is the development message. A production build throws the short form,
`[comvi] missing loader capability — attach @comvi/core/loader`, so grep for that one in
production logs.

**`VueI18n` has no instance proxies.** `addActiveNamespace`, `reloadTranslations`, `registerLoader`,
`registerLocaleDetector`, `registerPostProcessor`, `onMissingKey`, `onLoadError` and plugin
registration (0.4's `use(plugin)`) are not on the class. Registration happens on the host instead:

```diff check=skip:proxy-relocation
-i18n.registerLoader(myLoader);
-i18n.use(FetchLoader({ … }));
+const i18n = createI18n({ locale: "en" }).use(attachLoader).use(plugins());
+i18n.core.registerLoader(myLoader);
+i18n.core.registerPlugin(FetchLoader({ … }));
```

Both members are capabilities, so they exist on the host only once it has composed them:
`registerLoader` comes with the loader capability and `registerPlugin` with the plugin host. On the
base host `createI18n` builds, `i18n.core.registerPlugin(…)` is a type error and a `TypeError` at
runtime. Nothing on `VueI18n` is typed present and then throws "missing capability", which is why
plugin registration left with the rest.

### Rich text with `<T>`

Embed components inside a translation without raw HTML and without splitting the sentence across
template fragments. Translators see clean markup; the template decides what each tag renders to.
Vue's shape is **named slots**.

```json
{ "help": "Read <link>our docs</link> or <bold>contact us</bold>." }
```

```vue
<script setup lang="ts">
import { T } from "@comvi/vue";
</script>

<template>
  <T i18nKey="help">
    <template #link="{ children }">
      <a href="/docs">{{ children }}</a>
    </template>
    <template #bold="{ children }">
      <strong>{{ children }}</strong>
    </template>
  </T>
</template>
```

The `components` prop is the programmatic alternative; a map built in `setup()` is typed as
`ComponentMap` (the same name in all four bindings). Pass `tagInterpolation: { strict: "warn" }` to
`createI18n` to catch translations referencing tags you forgot to handle before they ship.

`<T skipPostProcess>` skips post-processors for that one call — notably the in-context editor's
invisible markers. `raw` is the same prop under its old 0.4 name: it still works, warns once in
development, and is removed in 0.6. The
[codemod](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md#3-the-codemod) cannot rewrite
Vue template markup, so it flags `<T raw>` here for a by-hand rename instead.

`<T>` never changes what `t()` does with `<b>` markup — it renders through the pure
`@comvi/core/rich-text` path. Making `t()` itself parse tags is a separate opt-in:
`import "@comvi/core/tags"` once, which registers the grammar process-wide. Until then
`t("Click <b>here</b>")` hands that markup back as text and development warns once per template.

### Reference: composing by hand

`@comvi/vue` re-exports core's capability installers **by name**, so an app names one package and
the ones you never call are pruned from your bundle: `createI18n`, `createI18nFromCore`,
`icuCompiler`, `loader`, `attachLoader`, `plugins`, `definePlugin`, `devtools`, and `I18n` as a
type.

`loader(map)` attaches the loader capability **and** registers the map, so it needs its map; a bare
`loader()` is a compile error. For a plain loader function, compose `attachLoader` and register it
on the core yourself, which also keeps the import-map adapter out of your bundle:

```ts
import { attachLoader, createI18n } from "@comvi/vue";

const i18n = createI18n({ locale: "en" }).use(attachLoader);
i18n.core.registerLoader(async (locale, ns) => (await fetch(`/i18n/${locale}/${ns}.json`)).json());
```

Your own inline plugin goes in through `definePlugin`, which composes the plugin host and registers
the function in one call. Browser-extension discovery is `devtools({ instanceId })`. The low-level
`attachPlugins` / `attachDevtools` pair is not re-exported here; import it from
`@comvi/core/plugins` / `@comvi/core/devtools`.

Full reasoning: [docs/design/composition.md](../../docs/design/composition.md).

## 5. Server-side rendering

**Build one instance per request.** A module-scope `createI18n(...)` is a singleton shared by every
concurrent request, and its locale is mutable: one visitor switching to `uk` moves the locale (and
the reactive `locale` ref) under everyone else's render. Construct the instance inside the request
handler, next to the app. This is the opposite of the rule `@comvi/next` follows.

**Pass the request locale as `ssrLocale`**, not as `locale`: it reaches the core before the reactive
ref is seeded, so the ref and `core.locale` agree on the very first render and the client hydrates
against the same locale it was served.

**`await i18n.init()` before `renderToString`.** `app.use(i18n)` starts `init()` fire-and-forget,
which is a client-side convenience; on the server that races translation loading and can serialize
an empty cache.

```ts title="server.ts"
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";

export async function render(localeFromRequest: string) {
  const app = createSSRApp(App);
  const i18n = createI18n({
    locale: "en",
    ssrLocale: localeFromRequest,
    translation: { en: { greeting: "Hello" }, uk: { greeting: "Привіт" } },
  });

  app.use(i18n);
  await i18n.init();

  return renderToString(app);
}
```

For Nuxt, use [`@comvi/nuxt`](../nuxt), which does all of this per request and adds locale routing,
payload transfer and auto-imports.

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

Measured min+gz through the package's published entry, with `vue` left out of the bundle, and
checked in CI against [`scripts/size-budgets.json`](../../scripts/size-budgets.json) with 5 % of
headroom. CI also reads the modules each bundle actually pulled in, so "a capability you never
import costs nothing" is checked rather than asserted.

| app shape                                   | measured as             | min+gz  |
| ------------------------------------------- | ----------------------- | ------- |
| base host + bindings + the `VueI18n` preset | `fw-vue-default`        | 7272 B  |
| every capability composed, with `<T>`       | `fw-vue-full-composite` | 11791 B |

## 8. Where to go next

- **Loading from the platform:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) for API mode,
  namespace layout and offline fallbacks.
- **Design notes:** [composition](../../docs/design/composition.md) ·
  [ICU](../../docs/design/icu.md) · [rich text](../../docs/design/rich-text.md) ·
  [formatting](../../docs/design/formatting.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **Upgrading from 0.4.x:** the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md), whose
  §3 has the codemod recipe — it is a repo-internal script, run by absolute path from your app's
  root, not a `pnpm` script you have. The codemod rewrites the destructures and
  _reports_ the proxy call sites, whose receiver type is textually undecidable.
- **Full API:** [comvi.io/docs/i18n/vue/](https://comvi.io/docs/i18n/vue/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
