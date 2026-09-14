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

`localeDetectorPlugin` restores a saved locale from the first configured cache target, then walks an ordered list of detection sources, returns the first match, and persists the user's choice back to one or more caches. Set `cacheFirst: false` when the configured `order` should take priority over a saved locale. SSR-safe (gracefully skips browser-only APIs on the server) and supports BCP 47 lookup so `de-DE` matches `de` and vice versa.

Throughout this README, **the host** is the object `createI18n` returns: it holds the catalog, the
current locale and `t()`.

Comvi i18n is a framework-agnostic i18n library with ICU MessageFormat, rich text without XSS
and typed translation keys. The [root README](https://github.com/comvi-io/comvi-js) has the
two-step quickstart, the package matrix and the measured bundle weights.

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
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).use(
  localeDetector({
    supportedLocales: ["en", "uk", "de"],
    order: ["querystring", "localStorage", "cookie", "navigator"],
    caches: ["localStorage", "cookie"],
    cacheFirst: false,
  }),
);

await i18n.init();
// → if URL has ?lng=uk, locale becomes "uk" and is saved to localStorage + cookie
```

## Two ways in

`@comvi/core` is the BASE host. The plugin host is an import you add, so an app
that registers no plugins never pays for it. This package exports one name for
each way of adding it.

|                   | `.use(localeDetector(options))`                                                                      | `registerPlugin(localeDetectorPlugin(options))`                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| what it is        | the **installer** — the bare name                                                                    | the **plugin factory** — the `*Plugin` name                                      |
| the host it needs | any host, including a bare `createI18n(…)`                                                           | one that already has `@comvi/core/plugins`                                       |
| what it composes  | the plugin host, idempotently. No loader: the detector hands core a locale and never loads a catalog | nothing; it only registers                                                       |
| lifecycle         | the host's own: it ends in `registerPlugin(localeDetectorPlugin(options))`                           | the host's own                                                                   |
| use it when       | you are setting up the host                                                                          | you already compose capabilities explicitly, or you register plugins from a list |

Both end in the same place. The installer is the one-call form of this:

```ts
import { createI18n } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";
import { localeDetectorPlugin } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).use(attachPlugins);
i18n.registerPlugin(localeDetectorPlugin({ supportedLocales: ["en", "uk", "de"] }));
```

**Swapping the two is a type error, and each half is caught at runtime too.**
Nothing is branded: an installer and a plugin are both "a function of the host",
and `.use` is a pipe and nothing more, so it never inspects, orders or brands
what you hand it. What it does check is identity: an installer widens the host
in place and hands that same host back, and `.use` refuses any other return
value, whatever its shape.

- `registerPlugin(localeDetector(…))` fails at `init()` with
  `E_INSTALLER_AS_PLUGIN`, the first thing the installer does, **before** the
  plugin host is set up and before a second plugin reaches the queue. The
  message names `localeDetector` and the `.use` form.
- `.use(localeDetectorPlugin(…))` throws `E_USE_NOT_INSTALLER`: the plugin is not an
  installer, so what it hands back is not the host. `.use` calls it before it
  checks. On a bare host it dies even earlier, on `registerLocaleDetector`, and
  because this plugin is synchronous that lands as a `TypeError` at the call
  site. On a host that already composed `@comvi/core/plugins` every member it
  touches exists, so the detector is live and subscribed to `localeChanged` by
  the time `.use` refuses the return value, with no cleanup registered for it.
  The listener is not leaked past teardown — `destroy()` clears every listener
  on the host wholesale, registered cleanup or not — but the detector cannot be
  disposed on its own short of destroying the host. `registerPlugin` is where a
  plugin gets `required`, `timeout`, `onError` and cleanup registration.

## How detection works

On initialization, the detector checks the first entry in `caches` as the saved user preference by default. If no cached value exists, it walks `order` from first to last and returns the first non-empty match. Set `cacheFirst: false` to skip that preliminary cache read and make `order` the complete priority list.

| Step | Source         | Looks at                 | Match?        |
| ---- | -------------- | ------------------------ | ------------- |
| 1    | `querystring`  | `?lng=uk` in the URL     | **uk** → done |
| 2    | `localStorage` | `i18n_locale` key        | (skipped)     |
| 3    | `cookie`       | `i18n_lang` cookie       | (skipped)     |
| 4    | `navigator`    | `navigator.languages[0]` | (skipped)     |

Once a locale is chosen (by detection or by an explicit `setLocale()` call) it is written to every entry in `caches`. Because the first cache entry is read before `order` by default, put your preferred saved-locale source first. Use `cacheFirst: false` when query string or navigator detection should be able to override it; cache writes remain enabled, and cache sources are still read when included in `order`.

BCP 47 lookup means `de-DE` matches `de` if `supportedLocales: ["en", "de"]`, and `zh-Hant-TW` falls back to `zh-Hant` then `zh`. Unsupported detected locales resolve to `fallbackLocale` (defaulting to the configured i18n locale) and are not cached.

## Pair with your framework

```tsx
// React
import { createI18n, I18nProvider } from "@comvi/react";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en", fallbackLocale: "en" }).use(
  localeDetector({
    supportedLocales: ["en", "uk", "de"],
    order: ["querystring", "cookie", "navigator"],
    caches: ["cookie", "localStorage"],
  }),
);

<I18nProvider i18n={i18n}>…</I18nProvider>;
```

Same setup works in Solid and Svelte, and in Vue: `createI18n` there returns a
`VueI18n` wrapper rather than a core host, and that wrapper has the same pipe,
so `createI18n({ … }).use(localeDetector({ … }))` reads identically. For
Next.js and Nuxt, prefer the framework's middleware (`@comvi/next`'s
`createMiddleware()` or `@comvi/nuxt`'s `detectBrowserLanguage` config), which
detect on the server before the page renders.

For all detection sources, cookie/storage key options, BCP 47 normalization rules, and the full options reference, see the [documentation](https://comvi.io/docs/i18n/plugins/locale-detector/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
