<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/core</h1>

<p align="center">The framework-agnostic runtime behind Comvi i18n: the host, <code>t()</code>, and the capability pipe.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/core"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/core?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/core` is the host every binding builds on. Use it directly for Web Components, static
sites, server-side scripts, or anywhere a framework would be more than you need. With
`@comvi/react`, `@comvi/vue`, `@comvi/next`, `@comvi/nuxt`, `@comvi/svelte` or `@comvi/solid` you
already have it. The full guide is [Vanilla JavaScript](https://comvi.io/docs/i18n/vanilla) on the
docs site.

## Install

```bash
npm install @comvi/core
# Node 20 or newer. No peer dependencies.
```

The package is ESM. A `<script src>` global build exists too, as `ComviCore.I18n`, fully composed.

## Create the host

```ts title="src/i18n.ts" check=group=vanilla-2
import { createI18n } from "@comvi/core";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  messages: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

await i18n.init();

i18n.t("greeting", { name: "Alice" }); // "Hello, Alice!"
```

`init()` readies the host before the first `t()` and resolves to the instance. `t()` always
returns a string; `tRaw()` returns the structured result when a translation carries tags.

## Switch the locale

```ts title="src/switch.ts" check=group=vanilla-2
import { i18n } from "./i18n";

await i18n.setLocale("uk");
console.log(i18n.t("greeting", { name: "Аліса" })); // "Привіт, Аліса!"
```

`await i18n.setLocale()` switches the locale; with a loader composed, it loads the active
namespaces first. Assigning `i18n.locale` does the same without waiting.

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

```ts title="src/i18n.ts" check=group=vanilla-cdn
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }));

await i18n.init();
```

Compose `.use(cdnLoader())` before `init()`: the first fetch happens inside `await init()`, so
there is no gate to write. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` from `@comvi/core/icu` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent, and either works without the other.

## Specific to core

The root entry is the base host: text and `{param}` interpolation, the messages cache, events,
default params and the `.use(installer)` pipe. Everything else is a subpath you import, and a
capability you never import never enters your bundle.

| You want                              | You import                                             | You write                   |
| ------------------------------------- | ------------------------------------------------------ | --------------------------- |
| ICU `plural`/`select`/`selectordinal` | `icuCompiler` from `@comvi/core/icu`                   | `compiler: icuCompiler`     |
| Async or remote loading               | `loader` or `attachLoader` from `@comvi/core/loader`   | `.use(loader(map))`         |
| The plugin host, post-processors      | `plugins` or `definePlugin` from `@comvi/core/plugins` | `.use(plugins())`           |
| Browser-extension discovery           | `devtools` from `@comvi/core/devtools`                 | `.use(devtools())`          |
| `<tag>` markup inside plain `t()`     | `@comvi/core/tags`                                     | `import "@comvi/core/tags"` |
| The rich-text toolbox                 | `prepareTranslation` from `@comvi/core/rich-text`      | `prepareTranslation(…)`     |

Without a framework's reactivity, events are how you learn that state changed: `i18n.on()` takes
`initialized`, `destroyed`, `localeChanged`, `defaultNamespaceChanged`, `messagesCleared`,
`loadingStateChanged`, `namespaceLoaded`, `missingKey`, `loadError` and `configChanged`, and returns
an unsubscribe function. `destroy()` tears the instance down; a destroyed instance cannot be
re-initialized. On a server, build a fresh host per request. Never assign a translation to
`innerHTML`; use `textContent` or build real nodes with `prepareTranslation`.

## Next steps

- [Vanilla guide](https://comvi.io/docs/i18n/vanilla): update the DOM from events, instance lifetime.
- [Core API reference](https://comvi.io/docs/i18n/api/core): every instance member, the events and the capability subpaths.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): `.use(loader(map))`, namespaces and caching.
- [Type safety](https://comvi.io/docs/i18n/type-safety): augment `TranslationKeys` on `@comvi/core` so `t()` autocompletes.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
