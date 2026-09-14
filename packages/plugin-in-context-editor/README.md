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
  <a href="https://bundlephobia.com/package/@comvi/plugin-in-context-editor"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/plugin-in-context-editor?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

> ⚠️ **Requires the [Comvi Platform](https://comvi.io).** This plugin saves edits back to the Comvi TMS via API, so it doesn't work standalone. You'll need a Comvi account and an API key.

The In-Context Editor overlays a visual editor on your app: hovering highlights translated strings, clicking opens a modal to edit the source value, and saved changes are pushed back to the Comvi TMS. Translators and product managers can fix copy without waiting for a redeploy.

**Who benefits:**

- **For translators:** Edit copy where it appears in your app, in context, instead of guessing from a string ID in a spreadsheet.
- **For product / engineering:** Ship copy fixes instantly without a code change or redeploy.

The editor renders independently of your app's framework, so it works with Vue, React, Solid, Svelte, Next.js, and Nuxt.

Comvi i18n is a framework-agnostic i18n library with ICU MessageFormat, rich text without XSS
and typed translation keys. The [root README](https://github.com/comvi-io/comvi-js) has the
two-step quickstart, the package matrix and the measured bundle weights.

📖 **Documentation:** https://comvi.io/docs/i18n/plugins/in-context-editor/

## Install

```bash
npm install @comvi/plugin-in-context-editor
# Peer: @comvi/core
```

## Quick start

```ts
import { createI18n } from "@comvi/core";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const i18n = createI18n({
  locale: "en",
  // Dev/preview editor key used to create and edit keys/translations.
  apiKey: import.meta.env.VITE_COMVI_EDITOR_API_KEY,
}).use(inContextEditor());

await i18n.init();
```

Without an API key the editor runs in **demo mode**: the UI mounts but edits are not persisted. The app-bundle production export is a no-op, so normal production builds do not ship the editor runtime. Production editing is handled by the browser extension: a translator opens the live site, enters their API key, and the extension injects the standalone editor. The API key needs project read plus translation read/write scopes.

## Two ways in

`@comvi/core` is the BASE host. Extension discovery and the plugin host are
imports you add, so an app that uses neither never pays for them. This package
exports one name for each way of adding them.

|                    | `.use(inContextEditor(options))`                                                                                            | `registerPlugin(InContextEditorPlugin(options))` |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| what it is         | the **installer**, lowercase                                                                                                | the **plugin factory**, uppercase                |
| the host it needs  | any host, including a bare `createI18n(…)`                                                                                  | one that already has `@comvi/core/plugins`       |
| what it composes   | `@comvi/core/devtools` first, then `@comvi/core/plugins`, both idempotently                                                 | nothing; it only registers                       |
| host type after    | **unchanged**. The editor asks nothing of your public API, and this is the only widening that stays true under `production` | unchanged                                        |
| lifecycle          | the host's own: it ends in `registerPlugin(InContextEditorPlugin(options))`                                                 | the host's own                                   |
| under `production` | `(host) => host`. No discovery, no capability, no plugin, no editor bytes                                                   | a plugin that does nothing                       |

Discovery comes first. The editor is the one capability that is driven from
outside the page, so an editor-enabled host announces itself on the
`window.__COMVI__` queue without a second `.use(devtools())`. If you want
`registerPlugin` yourself, compose `.use(plugins())`. The installer does not
promise it, because
under `production` that member would be typed present and absent at the same
time.

**Swapping the two is a type error, and it fails loudly at runtime too.** Nothing
is branded: an installer and a plugin are both "a function of the host". So each
slot rejects the other explicitly instead of half-working:

- `registerPlugin(inContextEditor(…))` fails at `init()` with
  `E_INSTALLER_AS_PLUGIN`. Under the default entry it stops on the installer's
  first ensure-step, before discovery or the plugin host is attached. Under
  `production` there is no ensure-step to stop on, so the identity no-op runs
  and hands the host back. A plugin may only return nothing or a cleanup
  function, so `init()` rejects that too, before anything is queued for
  teardown.
- `.use(InContextEditorPlugin(…))` calls the plugin against a host that has no
  `registerPostProcessor`, so the invocation is rejected. On a host that does
  have the plugin capability the plugin runs, and `.use` then throws
  `E_USE_NOT_INSTALLER`: an installer widens the host in place and hands that
  same host back, and `.use` refuses any other return value, whatever its shape.
  A plugin belongs in the queue, through `registerPlugin` or
  `definePlugin(fn)`.

For target-element scoping, the full options reference, and the standalone bundle (used by the Comvi Chrome extension), see the [documentation](https://comvi.io/docs/i18n/plugins/in-context-editor/).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
