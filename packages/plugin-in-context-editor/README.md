<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/plugin-in-context-editor</h1>

<p align="center">Edit translations directly inside your running app — point, click, save.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/plugin-in-context-editor"><img src="https://img.shields.io/npm/v/@comvi/plugin-in-context-editor?color=blue" alt="npm"></a>
  <a href="https://bundlejs.com/?q=%40comvi%2Fplugin-in-context-editor"><img src="https://deno.bundlejs.com/?q=@comvi/plugin-in-context-editor&badge=&badge-style=flat&badge-raster" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

> ⚠️ **Requires the [Comvi Platform](https://comvi.io)** — this plugin saves edits back to the Comvi TMS via API, so it doesn't work standalone. You'll need a Comvi account and an API key.

The In-Context Editor overlays a visual editor on your app: hovering highlights translated strings, clicking opens a modal to edit the source value, and saved changes are pushed back to the Comvi TMS. It's the fastest way for translators and product managers to fix copy without redeploying.

**Who benefits:**

- **For translators:** Edit copy where it actually appears in your app, in context, instead of guessing from a string ID in a spreadsheet.
- **For product / engineering:** Ship copy fixes instantly without a code change or redeploy.

The editor renders independently of your app's framework — works with Vue, React, Solid, Svelte, Next.js, and Nuxt.

## About Comvi i18n

Comvi i18n is a modern, framework-agnostic internationalization library — ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~8 kB gzipped** with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **Real ICU MessageFormat** — locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS.
- **Type-safe translation keys** via TypeScript declaration merging — autocomplete and parameter validation everywhere.
- **Pluggable** — translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

📖 **Documentation:** https://comvi.io/docs/i18n/plugins/in-context-editor/

## Install

```bash
npm install @comvi/plugin-in-context-editor
# Peer: @comvi/core
```

## Quick start

```ts
import { createI18n } from "@comvi/core";
import { InContextEditorPlugin } from "@comvi/plugin-in-context-editor";

const i18n = createI18n({
  locale: "en",
  // Dev/preview editor key used to create and edit keys/translations.
  apiKey: import.meta.env.VITE_COMVI_EDITOR_API_KEY,
}).use(InContextEditorPlugin());

await i18n.init();
```

Without an API key the editor runs in **demo mode** — the UI mounts but edits are not persisted. The app-bundle production export is a no-op, so normal production builds do not ship the editor runtime. Production editing is handled by the browser extension: a translator opens the live site, enters their API key, and the extension injects the standalone editor. The API key needs project read plus translation read/write scopes.

For target-element scoping, the full options reference, and the standalone bundle (used by the Comvi Chrome extension), see the [documentation](https://comvi.io/docs/i18n/plugins/in-context-editor/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
