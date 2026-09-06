<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/nuxt</h1>

<p align="center">Nuxt 3 / 4 module for Comvi i18n — auto-imports, SSR, and locale routing.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/nuxt"><img src="https://img.shields.io/npm/v/@comvi/nuxt?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/nuxt` builds on [`@comvi/vue`](../vue) as a Nuxt 3 / 4 module for drop-in i18n integration. Handles locale routing, SSR translation loading, browser-language detection, auto-imported composables, and registered components.

📖 **Documentation:** https://comvi.io/docs/i18n/nuxt/

⚖️ **Comparison:** [Comvi vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n/)

## Why Comvi i18n?

Comvi i18n is a framework-agnostic internationalization library with type-safe translations, real ICU MessageFormat, and a small bundle that stays safe under a strict CSP.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`). Translators see clean markup, and you decide what each tag renders to. No raw HTML, no unsafe DOM injection, and no splitting a sentence across template fragments.
- **ICU `plural`, `selectordinal` & `select`.** Locale-correct grammar via `Intl.PluralRules`, including Polish, Ukrainian, Arabic, Welsh and the rest. It is the same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~8.2 kB minified + gzipped for the default client graph, ~11.7 kB fully composed (measured, `vue` / `#app` / `h3` externalized), no runtime dependencies beyond `h3` and `@nuxt/kit`, which every Nuxt app already has.** ICU, the plugin host and devtools discovery cost only where your `hostModule` composes them. No `eval` or `new Function` anywhere, so it runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`, one lowercase `.with(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt), so switching frameworks doesn't mean relearning your i18n layer.
- **SSR support.** `@comvi/next` and `@comvi/nuxt` ship server-side translation loading, locale-routed layouts, and middleware for redirect-on-detect, so there is no flash of untranslated content.

## Why @comvi/nuxt?

- **Two-file setup.** Add `@comvi/nuxt` to `modules` in `nuxt.config.ts` and configure locales. Routing, detection, middleware and auto-imports work with no boilerplate. Point `hostModule` at one `comvi.host.ts` and that file is the whole of what your app pays for: ICU, loading, plugins and devtools are each one import and one `.with(...)`.
- **Auto-imported composables and registered components.** `useI18n()`, route helpers, `<T>`, and `<NuxtLinkLocale>` are available without manual imports. `$t` is installed as a Vue global property for templates.
- **Built-in locale routing and middleware.** Clones your existing pages into locale-prefixed routes and adds a global middleware for locale detection and cookie persistence, with no extra setup.

## Install

```bash
npm install @comvi/nuxt
# Peer: nuxt ^3.0.0 || ^4.0.0
```

## Quick start

```ts
// nuxt.config.ts
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: [
      { code: "en", name: "English", iso: "en-US" },
      { code: "uk", name: "Українська", iso: "uk-UA" },
    ],
    defaultLocale: "en",
    localePrefix: "as-needed",
    hostModule: "./comvi.host.ts",
  },
});
```

```ts
// comvi.host.ts — the host, composed explicitly
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).with(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
    }),
  )) satisfies NuxtHostFactory;
```

```vue
<script setup lang="ts">
const { t, locale } = useI18n(); // auto-imported
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
  <NuxtLinkLocale to="/" :locale="locale === 'en' ? 'uk' : 'en'">Switch</NuxtLinkLocale>
</template>
```

`comvi.host.ts` is where every capability is chosen, and that is the whole of
0.5.0's change to this module. Leave `hostModule` out and the module builds the
BASE host for you: text and `{param}` interpolation, the translation cache,
events and default params, with no ICU compiler, no loader, no plugin host and
no devtools discovery. Nothing is injected on your behalf, so nothing you did not
ask for is in your bundle. (ICU is the one capability that default host can
still opt into, with `icu: true`; it stays off unless you ask.) See
[Composing your host](#composing-your-host-the-hostmodule-option) for the full
menu; the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md)
has the upgrade path.

## Server-side translation loading

The Nuxt module handles SSR by loading translations on the server and hydrating
the client with pre-loaded messages. SSR loading is the loader capability at
work, so a server-rendered app composes `loader()` in `comvi.host.ts` as the
quickstart above does. Without it the server utilities say so once, by name,
and render whatever the catalog already holds. They never call a member the
host does not have.

```vue
<!-- app.vue or any page -->
<script setup lang="ts">
const { t, locale, setLocale } = useI18n(); // auto-imported
</script>

<template>
  <div>
    <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
    <button @click="setLocale(locale === 'en' ? 'uk' : 'en')">Switch: {{ locale }}</button>
  </div>
</template>
```

The composable is auto-imported by the module. Call `setLocale()` to load and
switch translations asynchronously. The module's route middleware pre-loads
translations for the current locale before the page renders.

## Locale routing

The Nuxt module creates locale-prefixed routes from your existing pages automatically. Configure locales and the module clones those pages into localized paths.

```ts
// nuxt.config.ts
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: ["en", "uk", "de"],
    defaultLocale: "en",
    localePrefix: "as-needed", // 'always' | 'as-needed' | 'never'
  },
});
```

The middleware auto-detects the user's language from the URL path, cookies, or the server-side Accept-Language header, and persists the choice in a cookie. Use `<NuxtLinkLocale>` to navigate between locales while preserving the current route path.

```vue
<template>
  <nav>
    <NuxtLinkLocale to="/" :locale="'en'">English</NuxtLinkLocale>
    <NuxtLinkLocale to="/" :locale="'uk'">Українська</NuxtLinkLocale>
  </nav>
</template>
```

For more routing details, browser-language detection options, and helper composables like `useLocalePath` and `useSwitchLocalePath`, see the [documentation](https://comvi.io/docs/i18n/nuxt/).

## Capability composables: `useI18nLoader()` / `useI18nPlugins()`

Async loading and the plugin host are `@comvi/core` **capabilities** rather than
part of the translation core. Since 0.5.0 you acquire their members explicitly
instead of getting them from `useI18n()`. Both are auto-imported, like
`useI18n`:

```vue
<script setup lang="ts">
const { t } = useI18n("admin");
const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
  useI18nLoader();
const { onMissingKey } = useI18nPlugins();
</script>
```

They verify the capability once, at the acquisition call, and throw in
development and production alike when the host has none, so a component that
asks for something the app never composed fails loudly at the acquisition call
instead of doing nothing.

`comvi.setup` hooks no longer reach a capability through `i18n`. The context's
`i18n` is the union `VueI18n<{}, C> | C`, the wrapper in the app plugin and the
host itself in a server utility (`nuxt/src/types.ts:351-360`), and `VueI18n`
dropped its eight capability proxies, so `i18n.core.*` neither compiles without
a `'core' in i18n` narrowing nor exists on the server arm. The context hands you
the host directly as `core`, the same object on both runtimes:

```diff check=skip:proxy-relocation
-export default ({ i18n }) => { i18n.registerLoader(myLoader); };
+export default ({ core }) => { core.registerLoader(myLoader); };
```

That call needs a host that composed the loader, which is a `comvi.host.ts`
decision, not a `comvi.setup.ts` one. Type the hook with the host you built and
TypeScript tells you before the app runs:

```ts
// comvi.setup.ts
import type { I18n } from "@comvi/core";
import type { I18nLoaderApi, LoaderFn } from "@comvi/core/loader";
import type { NuxtI18nSetup } from "@comvi/nuxt";

const myLoader: LoaderFn = async (locale, namespace) =>
  (await fetch(`/i18n/${locale}/${namespace}.json`)).json();

export default (({ core }) => {
  core.registerLoader(myLoader);
}) satisfies NuxtI18nSetup<I18n & I18nLoaderApi>;
```

`NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` are generic in the host type and
default to core's base `I18n`, "so capability calls do not compile by accident"
(`nuxt/src/types.ts:393-394`). A hook on the module's own host needs no
annotation, and one on a composed host must name it. Migrating from 0.4.x:
`pnpm codemod:framework-slim "app/**/*.{ts,vue}"`, or the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## Composing your host: the `hostModule` option

`hostModule` points at a module whose default export builds the host. It is a
module **path**, not a function, and the branch is taken at **build time**: the
module generates `#build/comvi.host`, and with `hostModule` set neither the
runtime plugin nor the server utilities go through nuxt's own construction
path. A runtime `if` could not deliver that, because it would keep both paths alive in
every bundle.

```ts
// nuxt.config.ts
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./comvi.host.ts" },
});
```

The factory is handed nuxt's **resolved options**: `locale` (the render locale
on the client, the request locale on the server), `fallbackLocale`, `defaultNs`,
`defaultParams`, `tagInterpolation` from `basicHtmlTags`, `devMode` and
`apiKey`. Spreading them keeps `nuxt.config` in charge of configuration while
you stay in charge of capabilities. It is called once per constructed
instance (the client plugin, and each per-request server instance), so it must
return a FRESH host every call.

ICU is the one exception to "compose it here": `compiler` is a constructor
argument rather than something `.with()` can pipe on, so an app with no
`hostModule` reaches it through the `icu: true` module option instead.
Everything else in the table below (loader, plugins, devtools) still needs
`hostModule`, and with `hostModule` set `icu` is ignored with a build-time
warning because your factory already chose a compiler.

Each capability is one import and one `.with(...)`. `.with(installer)` is
core's composition pipe: `i18n.with(f)` is `f(i18n)`, nothing more.

| you want                                                  | you add                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ICU plurals / select / selectordinal                      | `compiler: icuCompiler` from `@comvi/core/icu`, in the options object                                                                          |
| SSR + async translation loading                           | `.with(loader(importMap))` from `@comvi/core/loader`                                                                                           |
| plugins, locale detectors, missing-key hooks              | `.with(plugins())` from `@comvi/core/plugins`                                                                                                  |
| browser-extension discovery                               | `.with(devtools())` from `@comvi/core/devtools`                                                                                                |
| `<tag>` syntax in plain string-API `t()`                  | `import "@comvi/core/tags"` once, anywhere in the app                                                                                          |
| a first-party plugin: CDN loader, locale detector, editor | `.with(cdnLoader({ … }))` / `.with(localeDetector())` / `.with(inContextEditor())`; each installer composes the capabilities that plugin needs |

```ts
// comvi.host.ts — everything at once
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })
    .with(loader({ uk: () => import("./locales/uk.json") }))
    .with(plugins())
    .with(devtools())) satisfies NuxtHostFactory;
```

Order matters in one way, and it is not the order above: `.with(icu())` must run
before the first catalog reaches the host (constructor `translation`,
`addTranslations`, or a loader merge). The order of `loader()`, `plugins()` and
`devtools()` among themselves is free, because every capability composed before
`init()` is attached by the time plugins run.
`loader(map)` attaches the loader capability **and** registers the map; for a
plain `LoaderFn`, use `.with(attachLoader)` and call `registerLoader(fn)`.

So `comvi.host.ts` is the one file in a nuxt app that names comvi packages at
all. `useI18n()`, `useI18nLoader()`, `useI18nPlugins()`, `<T>` and
`<NuxtLinkLocale>` are auto-imported, so app code names none. The composition
root is a single readable file, and reading it tells you what your app pays for.

### What a nuxt app pays

Whole-app comvi graph, min+gz, `vue` / `#app` / `#build` / `h3` externalized
(`node scripts/size-check.mjs`; the committed anchors live in
`scripts/size-budgets.json`):

| graph                                                     | min+gz    | row                             |
| --------------------------------------------------------- | --------- | ------------------------------- |
| client: runtime plugin + `useI18n()` on the base host     | **8108**  | `fw-nuxt-client-default`        |
| server: the same, plus the loader capability SSR needs    | **10017** | `fw-nuxt-server-default-loader` |
| every capability composed: ICU, loader, plugins, devtools | 11648     | `fw-nuxt-full-composite`        |

The client row is what `hostModule`-unset builds. The last row is the migration
CEILING for a fully composed 0.4 nuxt app rather than a parity claim: 0.4 also
registered string-API tag syntax ambiently, which is now the separate
`import "@comvi/core/tags"`. Every row is gated on its emitted module graph as
well as its bytes, at the corpus-wide measured + 2%.

## Rich text with `<T>`

The `<T>` component is inherited from [`@comvi/vue`](../vue). Embed components in translation strings without raw HTML or unsafe DOM injection.

```json
{ "help": "Read <link>our docs</link> or <bold>contact us</bold>." }
```

```vue
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

See the [Vue README](../vue) for the full Rich Text section with slot patterns and validation options.

## ICU MessageFormat

ICU MessageFormat handles plurals, ordinals and select with locale-correct
grammar via `Intl.PluralRules`. It is a capability: add `compiler: icuCompiler`
from `@comvi/core/icu` in `comvi.host.ts` and every catalog in the app is
compiled with it.

```ts
// comvi.host.ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })) satisfies NuxtHostFactory;
```

Without a `hostModule`, set `icu: true` in `nuxt.config.ts` instead. It is the
one capability with a module option, because `compiler` is a constructor
argument no `.with(...)` can add afterwards:

```ts
// nuxt.config.ts
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: { locales: ["en", "uk"], defaultLocale: "en", icu: true },
});
```

`icu` defaults to `false` and the choice is made in codegen, so leaving it off
emits a `#build/comvi.host` that never mentions `@comvi/core/icu`: 0 B rather
than a disabled feature. It is ignored (with a build-time warning) when `hostModule`
is set, since your factory already passes its own `compiler`.

```vue
<script setup lang="ts">
const { t } = useI18n(); // auto-imported

const items = t("items", { count: 5 });
</script>
```

**Without it, ICU syntax never renders as grammar, and never fails silently.** A
message like `{count, plural, one {# item} other {# items}}` on the default
compiler throws `E_ICU_SYNTAX` at ingestion in development. In production the
braced segment renders literally and `E_ICU_SYNTAX`, naming the argument type,
is reported through `onError` (or `console.error`) on the compilation that hit
it, rather than rendering plausibly-wrong text a reviewer would never catch. Quoted literals such as
`'{name, other}'` stay valid text.

See the [@comvi/vue ICU section](../vue#icu-messageformat)
for the full multilingual examples, ordinals and select.

## Type-safe translation keys

Extend the `TranslationKeys` interface via declaration merging for autocomplete and parameter validation. Type definitions can be generated automatically from the Comvi Platform via `@comvi/cli` or from local JSON files via `@comvi/vite-plugin`.

```typescript
// src/types/i18n.d.ts
import "@comvi/core"; // resolves the module before augmenting it

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: { name: string };
    hello: never;
    items: { count: number };
    "errors:NOT_FOUND": never;
  }
}
```

```vue
<script setup lang="ts">
const { t } = useI18n();

// ✓ Autocomplete, params required
const msg = t("welcome", { name: "Alice" });

// ✓ No params needed
const hello = t("hello");

// ✓ Namespaced keys use the ns option
const notFound = t("NOT_FOUND", { ns: "errors" });
</script>
```

**What TypeScript catches:**

```vue check=expect-error
<script setup lang="ts">
const { t } = useI18n(); // auto-imported

// ✗ TS2345 — Argument of type '"welcome"' is not assignable to parameter of type
//   'never'. `welcome` declares a required param, so the key-only overload is out.
t("welcome");
</script>
```

```vue check=expect-error
<script setup lang="ts">
const { t } = useI18n(); // auto-imported

// ✗ TS2769 (no overload matches) — Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ TS2769 (no overload matches) — Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ TS2769 (no overload matches) — '"typo"' is not a declared key
t("typo", { name: "Alice" });
</script>
```

For CDN-delivered translations and visual in-context editing, pair with the [Comvi Platform](https://comvi.io) via [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) and [`@comvi/plugin-in-context-editor`](../plugin-in-context-editor).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
