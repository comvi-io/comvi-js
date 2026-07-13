<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/plugin-locale-detector</h1>

<p align="center">Auto-detect the user's locale from URL, storage, cookies, or <code>navigator</code>.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/plugin-locale-detector"><img src="https://img.shields.io/npm/v/@comvi/plugin-locale-detector?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/plugin-locale-detector"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/plugin-locale-detector?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`LocaleDetector` restores a saved locale from the first configured cache target, then walks an ordered list of detection sources, returns the first match, and persists the user's choice back to one or more caches. Set `cacheFirst: false` when the configured `order` should take priority over a saved locale. SSR-safe (gracefully skips browser-only APIs on the server) and supports BCP 47 lookup so `de-DE` matches `de` and vice versa.

## About Comvi i18n

Comvi i18n is a modern, framework-agnostic internationalization library — ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~8 kB minified + gzipped (as bundled by your app)** with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **Real ICU MessageFormat** — locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS.
- **Type-safe translation keys** via TypeScript declaration merging — autocomplete and parameter validation everywhere.
- **Pluggable** — translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

### Why @comvi/plugin-locale-detector?

- **Multi-source detection with configurable priority.** Detect from URL query string, cookie, localStorage, sessionStorage, or `navigator.language`, with optional cache-first priority.
- **Persists user choice.** Automatically saves the detected or manually-changed locale to storage so it survives page reloads.
- **SSR-safe.** Gracefully degrades when browser APIs (`window`, `navigator`, `document`) aren't available on the server.

📖 **Documentation:** https://comvi.io/docs/i18n/plugins/locale-detector/

## Install

```bash
npm install @comvi/plugin-locale-detector
# Peer: @comvi/core
```

## Quick start

```ts
import { createI18n } from "@comvi/core";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).use(
  LocaleDetector({
    supportedLocales: ["en", "uk", "de"],
    order: ["querystring", "localStorage", "cookie", "navigator"],
    caches: ["localStorage", "cookie"],
    cacheFirst: false,
  }),
);

await i18n.init();
// → if URL has ?lng=uk, locale becomes "uk" and is saved to localStorage + cookie
```

## How detection works

On initialization, the detector checks the first entry in `caches` as the saved user preference by default. If no cached value exists, it walks `order` from first to last and returns the first non-empty match. Set `cacheFirst: false` to skip that preliminary cache read and make `order` the complete priority list. Concrete walk-through with the Quick start config above:

| Step | Source         | Looks at                 | Match?        |
| ---- | -------------- | ------------------------ | ------------- |
| 1    | `querystring`  | `?lng=uk` in the URL     | **uk** → done |
| 2    | `localStorage` | `i18n_locale` key        | (skipped)     |
| 3    | `cookie`       | `i18n_lang` cookie       | (skipped)     |
| 4    | `navigator`    | `navigator.languages[0]` | (skipped)     |

Once a locale is chosen — by detection or by an explicit `setLocale()` call — it's written to every entry in `caches`. Because the first cache entry is read before `order` by default, put your preferred saved-locale source first. Use `cacheFirst: false` when query string or navigator detection should be able to override it; cache writes remain enabled, and cache sources are still read when included in `order`.

BCP 47 lookup means `de-DE` matches `de` if `supportedLocales: ["en", "de"]`, and `zh-Hant-TW` falls back to `zh-Hant` then `zh`. Unsupported detected locales resolve to `fallbackLocale` (defaulting to the configured i18n locale) and are not cached.

## Pair with your framework

```tsx
// React
import { createI18n, I18nProvider } from "@comvi/react";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" }).use(
  LocaleDetector({
    supportedLocales: ["en", "uk", "de"],
    order: ["querystring", "cookie", "navigator"],
    caches: ["cookie", "localStorage"],
  }),
);

<I18nProvider i18n={i18n}>{/* ... */}</I18nProvider>;
```

Same setup works in Vue, Solid, Svelte. For Next.js and Nuxt, prefer the framework's middleware (`@comvi/next`'s `createMiddleware()` or `@comvi/nuxt`'s `detectBrowserLanguage` config) — they detect on the server before the page renders.

For all detection sources, cookie/storage key options, BCP 47 normalization rules, and the full options reference, see the [documentation](https://comvi.io/docs/i18n/plugins/locale-detector/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
