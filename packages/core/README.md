<!-- MIGRATION_PENDING (lot 10): this README still documents the 0.7 API (.use() composition, devtools({ instanceId }), exposeGlobal); the 0.8 API is in docs/design and the lot-1 changesets. -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/core</h1>

<p align="center">The framework-agnostic runtime behind Comvi i18n: the i18n instance, <code>t()</code>, and the capability pipe.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=@comvi/core&amp;treeshake=%5B%7BcreateI18n%7D%5D"><img src="https://deno.bundlejs.com/badge?q=@comvi/core&amp;treeshake=%5B%7BcreateI18n%7D%5D" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/vanilla"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/core` is the i18n instance every Comvi binding builds on. Use it directly for Web
Components, static sites, server scripts, or anywhere a framework would be more than you need;
with `@comvi/react`, `@comvi/vue`, `@comvi/next`, `@comvi/nuxt`, `@comvi/svelte` or `@comvi/solid`
you already have it.

## Install

```bash
npm install @comvi/core
# Node 20 or newer. No peer dependencies.
```

## Create the i18n instance

In `src/i18n.ts`:

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

`init()` readies the i18n instance before the first `t()` and resolves to it. `t()` fills `{name}`
from its second argument and always returns a string.

## Switch the locale

In `src/switch.ts`:

```ts title="src/switch.ts" check=group=vanilla-2
import { i18n } from "./i18n";

await i18n.setLocale("uk");
console.log(i18n.t("greeting", { name: "Аліса" })); // "Привіт, Аліса!"
```

`await i18n.setLocale()` switches the locale; with a loader composed, it loads the active
namespaces first. Assigning `i18n.locale` does the same without waiting.

## Load from Comvi

The CDN loader is the `@comvi/core/cdn` subpath. Pass it as the instance's `loader`, in `src/i18n.ts`:

```ts title="src/i18n.ts" check=group=vanilla-cdn
import { createI18n } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader: cdn("https://cdn.comvi.io/<project-token>"),
});

await i18n.ready;
```

The first fetch starts in `createI18n()`; `i18n.ready` settles when it has. On a server that
creates an instance per request, pass one `createCatalogStore()` to the loader
(`cdn(url, { store })`) so the requests share the fetched catalogs. The CDN URL comes from **Settings → Content Deploy** in the Comvi project; the
walkthrough is [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi).

## How it works

The root entry is the base instance: text and `{param}` interpolation, the messages cache, events,
default params and the `.use(installer)` pipe. Everything else is a subpath you import, and a
capability you never import never enters your bundle.

| You want                                      | You import                                             | You write                   |
| --------------------------------------------- | ------------------------------------------------------ | --------------------------- |
| ICU `plural`/`select`/`selectordinal`         | `icuCompiler` from `@comvi/core/icu`                   | `compiler: icuCompiler`     |
| Async or remote loading                       | `loader` or `attachLoader` from `@comvi/core/loader`   | `.use(loader(map))`         |
| Plugins, post-processors                      | `plugins` or `definePlugin` from `@comvi/core/plugins` | `.use(plugins())`           |
| The Comvi browser extension to find the app   | `devtools` from `@comvi/core/devtools`                 | `.use(devtools())`          |
| `<tag>` markup parsed by plain `t()`/`tRaw()` | `@comvi/core/tags`                                     | `import "@comvi/core/tags"` |
| Rich text without `innerHTML`                 | `prepareTranslation` from `@comvi/core/rich-text`      | `prepareTranslation(…)`     |

Without a framework's reactivity, events are how you learn that state changed: `i18n.on()` takes
`initialized`, `destroyed`, `localeChanged`, `defaultNamespaceChanged`, `messagesCleared`,
`loadingStateChanged`, `namespaceLoaded`, `missingKey`, `loadError` and `configChanged`, and returns
an unsubscribe function. `destroy()` tears the instance down; a destroyed instance cannot be
re-initialized. On a server, build a fresh instance per request. Never assign a translation to
`innerHTML`; use `textContent`, or render the content tree `prepareTranslation` returns into nodes yourself.

A `<script src>` global build exists too, as `ComviCore.I18n`. It bundles the ICU compiler, the
loader, plugins and tag parsing, and registers the instance for the Comvi browser extension on
its own; `exposeGlobal: false` turns that registration off.

## Read next

- [Vanilla guide](https://comvi.io/docs/i18n/vanilla): update the DOM from events, instance lifetime.
- [Core API reference](https://comvi.io/docs/i18n/api/core): every instance member, the events and the capability subpaths.
- [Loading translations](https://comvi.io/docs/i18n/loading-translations): `.use(loader(map))`, namespaces and caching.
- [Type safety](https://comvi.io/docs/i18n/type-safety): augment `TranslationKeys` on `@comvi/core` so `t()` autocompletes.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
