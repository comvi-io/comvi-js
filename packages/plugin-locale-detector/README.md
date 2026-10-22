<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/plugin-locale-detector</h1>

<p align="center">Detect the user's locale from the URL, storage, cookies or <code>navigator</code>, and persist the choice.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/plugin-locale-detector"><img src="https://img.shields.io/npm/v/@comvi/plugin-locale-detector?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=@comvi/plugin-locale-detector&amp;treeshake=%5B%7BlocaleDetector%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22@comvi/core%22%5D%7D%7D"><img src="https://deno.bundlejs.com/badge?q=@comvi/plugin-locale-detector&amp;treeshake=%5B%7BlocaleDetector%7D%5D&amp;config=%7B%22esbuild%22%3A%7B%22external%22%3A%5B%22@comvi/core%22%5D%7D%7D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vanilla"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/plugin-locale-detector` picks the starting locale from the browser (query string, storage,
cookie, `navigator.language`) and remembers the user's later choice. Use it in a client-rendered
app; on Next.js and Nuxt the framework packages detect the locale on the server instead.

## Install

```bash
npm install @comvi/plugin-locale-detector
# Peer: @comvi/core, which every framework package already brings
```

## Detect and persist

In `src/i18n.ts`:

```ts title="src/i18n.ts" check=group=locale-detector-1
import { createI18n } from "@comvi/core";
import { localeDetector } from "@comvi/plugin-locale-detector";

export const i18n = createI18n({ locale: "en", fallbackLocale: "en" }).use(
  localeDetector({ supportedLocales: ["en", "uk", "de"] }),
);

await i18n.init();
```

`.use(localeDetector())` registers the detector; every option is optional. On a framework binding
the same `.use()` goes inside the `createI18n` expression, before the provider or plugin starts
`init()`.

### How it works

`init()` runs the detector after every plugin has registered, so a loader composed next to it is
in place, and applies the result through `setLocale()`, so the new locale's namespaces load before
it takes effect. With `cacheFirst` (the default) the first entry in `caches` is read first, and a
tag there that resolves ends detection. Otherwise each source in `order` is tried left to right,
and the first tag that resolves wins; `navigator` reads `navigator.languages[0]`, then
`navigator.language`. When no source yields a tag, the result is the plugin's `fallbackLocale`,
which defaults to the instance's locale at init, and it is not cached. Every later `setLocale()`,
including the one your switcher makes, is written to every configured cache.

With `supportedLocales`, a detected tag is matched with BCP 47 lookup: case-insensitive exact
match, then shorter prefixes (`zh-Hant-TW`, `zh-Hant`, `zh`), then the first supported locale with
the same base language (`de` to `de-DE`). A tag that matches nothing is skipped and the next
source is tried. Without `supportedLocales` or `convertDetectedLocale`, every detected and cached
tag is shortened to its base language, so `pt-BR` resolves to `pt`; an app with a regional locale
must list its locales in `supportedLocales`.

## Options

| Option                  | Default                                                                    | Behaviour                                                                            |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `order`                 | `['querystring', 'localStorage', 'sessionStorage', 'cookie', 'navigator']` | Sources, tried left to right.                                                        |
| `caches`                | `['localStorage']`                                                         | Where a detected or selected locale is written; the first is read on startup.        |
| `cacheFirst`            | `true`                                                                     | Read the first cache before scanning `order`.                                        |
| `lookupQuerystring`     | `'lng'`                                                                    | Query parameter name.                                                                |
| `lookupCookie`          | `'i18n_lang'`                                                              | Cookie name.                                                                         |
| `lookupLocalStorage`    | `'i18n_locale'`                                                            | `localStorage` key.                                                                  |
| `lookupSessionStorage`  | `'i18n_locale'`                                                            | `sessionStorage` key.                                                                |
| `cookieOptions`         | `{ path: '/', sameSite: 'lax' }`                                           | Also `domain` and `secure`. `sameSite: 'none'` adds `Secure`.                        |
| `cookieMaxAge`          | `31536000`                                                                 | Cookie lifetime in seconds, one year.                                                |
| `fallbackLocale`        | `i18n.locale` at plugin init                                               | Used when no source yields a supported tag.                                          |
| `supportedLocales`      | none                                                                       | Restricts detected tags with BCP 47 lookup.                                          |
| `convertDetectedLocale` | none                                                                       | `(tag) => string` mapping applied to every raw tag; switches `supportedLocales` off. |

Set `cacheFirst: false` to let `order` alone decide priority, for example so a query parameter
can override a persisted choice; caches are still written. `localStorage` and `sessionStorage`
access and cookie writes are wrapped, so private mode and quota errors are ignored. Only one detector is active on an
i18n instance; a later registration replaces it. `destroy()` removes the plugin's listeners.

## On the server

The query, storage and cookie sources return nothing without `window` and `document`, and the
`navigator` source reads whatever the runtime exposes, so do not rely on this plugin for a
server render. Make the server-side decision in your framework's middleware and share it through
a cookie; `@comvi/next` and `@comvi/nuxt` ship their own detection and need no detector on the
i18n instance. See [Server-side rendering](https://comvi.io/docs/i18n/ssr#locale-on-the-server).

## Read next

- [Locale detector](https://comvi.io/docs/i18n/plugins/locale-detector): common setups, the tag validation rule.
- [Language switching](https://comvi.io/docs/i18n/language-switching): `setLocale`, persistence and direction.
- [Plugins overview](https://comvi.io/docs/i18n/plugins): installers, plugin factories and registration options.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
