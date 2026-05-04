<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/nuxt</h1>

<p align="center">Nuxt 3 module for Comvi i18n — auto-imports, SSR, and locale routing.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/nuxt"><img src="https://img.shields.io/npm/v/@comvi/nuxt?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/nuxt` builds on [`@comvi/vue`](../vue) as a Nuxt 3 module for drop-in i18n integration. Handles locale routing, SSR translation loading, browser-language detection, auto-imported composables, and registered components.

📖 **Documentation:** https://comvi.io/docs/i18n/nuxt/

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~8 kB gzipped, zero runtime dependencies.** No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.
- **First-class SSR.** `@comvi/next` and `@comvi/nuxt` ship server-side translation loading, locale-routed layouts, and middleware for redirect-on-detect — no flash of untranslated content.

## Why @comvi/nuxt?

- **One-line setup.** Add `@comvi/nuxt` to `modules` in `nuxt.config.ts` and configure locales — routing, SSR, and detection work automatically without boilerplate.
- **Auto-imported composables and registered components.** `useI18n()`, route helpers, `<T>`, and `<NuxtLinkLocale>` are available without manual imports. `$t` is installed as a Vue global property for templates.
- **Built-in locale routing and middleware.** Clones your existing pages into locale-prefixed routes and adds a global middleware for locale detection and cookie persistence — no extra setup needed.

## Install

```bash
npm install @comvi/nuxt
# Peer: nuxt ^3.0.0
```

## Quick start

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: [
      { code: "en", name: "English", iso: "en-US" },
      { code: "uk", name: "Українська", iso: "uk-UA" },
    ],
    defaultLocale: "en",
    localePrefix: "as-needed",
  },
});
```

```ts
// comvi.setup.ts
export default ({ i18n }) => {
  i18n.registerLoader({
    en: () => import("./locales/en.json"),
    uk: () => import("./locales/uk.json"),
  });
};
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

## Server-side translation loading

The Nuxt module handles SSR by initializing translations on the server and hydrating the client with pre-loaded messages. Register a loader in your Comvi setup file; once the loader is configured, the module loads translations automatically on the server side.

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

The composable is auto-imported via the module's `addImportsDir` configuration. Call `setLocale()` to load and switch translations asynchronously. The module's route middleware pre-loads translations for the current locale before the page renders.

## Locale routing

The Nuxt module creates locale-prefixed routes from your existing pages automatically. Configure locales and the module clones those pages into localized paths.

```ts
// nuxt.config.ts
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

## ICU MessageFormat — locale-correct grammar, not just singular/plural

ICU MessageFormat handles plurals, ordinals, and select with locale-correct grammar via `Intl.PluralRules` — Comvi i18n inherits the full ICU runtime from the underlying binding.

```vue
<script setup lang="ts">
const { t } = useI18n(); // auto-imported

const items = t("items", { count: 5 });
</script>
```

See the [@comvi/vue ICU section](../vue#icu-messageformat--locale-correct-grammar-not-just-singularplural) for the full multilingual examples, ordinals, and select.

## Type-safe translation keys

Extend the `TranslationKeys` interface via declaration merging for autocomplete and parameter validation. Type definitions can be generated automatically from the Comvi Platform via `@comvi/cli` or from local JSON files via `@comvi/vite-plugin`.

```typescript
// src/types/i18n.d.ts
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: never;
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
const greeting = t("greeting");

// ✓ Namespaced keys use the ns option
const notFound = t("NOT_FOUND", { ns: "errors" });
</script>
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
t("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
t("typo", { name: "Alice" });
```

For CDN-delivered translations and visual in-context editing, pair with the [Comvi Platform](https://comvi.io) via [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) and [`@comvi/plugin-in-context-editor`](../plugin-in-context-editor).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
