<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/plugin-in-context-editor</h1>

<p align="center">Edit translations inside your running app: hold Alt, click the text, save to Comvi.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/plugin-in-context-editor"><img src="https://img.shields.io/npm/v/@comvi/plugin-in-context-editor?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/plugin-in-context-editor"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/plugin-in-context-editor?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/plugin-in-context-editor` injects invisible key markers into `t()` output so a translator
can click any rendered text and edit it in the browser. Saves go to the
[Comvi platform](https://comvi.io) over its API, so it needs a project and an API key; it has no
offline mode. The full guide is
[In-context editor](https://comvi.io/docs/i18n/plugins/in-context-editor) on the docs site.

## Install

```bash
npm install @comvi/plugin-in-context-editor
# Peer: @comvi/core, which every framework package already brings
```

## Set up

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

export const i18n = createI18n({
  locale: "en",
  apiKey: import.meta.env.DEV ? import.meta.env.VITE_COMVI_EDITOR_API_KEY : undefined,
})
  .use(cdnLoader({ cdnUrl: import.meta.env.VITE_COMVI_CDN_URL }))
  .use(inContextEditor());

await i18n.init();
```

Create an API key in the project's settings with project read plus translation read and write;
read alone loads the editor but every save fails. The editor reads the key off `i18n.apiKey`, the
same option the fetch loader reads for API mode. Compose a loader or an inline `messages`
catalog next to it: the editor can only edit text the app rendered through `t()`.

**An API key in a browser bundle is readable by every visitor, and this one can overwrite
translations, so the editor key must never be in a production build or a public preview build.**
The `import.meta.env.DEV` test is what keeps it out: Vite replaces it with `false` in a build, and
the bundler drops the key with the dead branch.

| Do this                                  | And                                                         |
| ---------------------------------------- | ----------------------------------------------------------- |
| Hold `Alt` (`Option` on macOS) and hover | translated elements light up with an overlay naming the key |
| `Alt` + click a highlighted element      | the edit modal opens on that key                            |
| `Cmd` or `Ctrl` + `S` in the modal       | saves without closing                                       |
| `Escape`                                 | closes the modal, or asks about unsaved edits               |

With no key configured the plugin starts in demo mode: the console says
`[@comvi/plugin-in-context-editor] Running in demo mode - API key not configured. Changes cannot be saved.` once,
and every click opens one panel naming the key, with no translation list.

## Gate it out of production

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const editorEnabled = import.meta.env.DEV;

const base = createI18n({
  locale: "en",
  fallbackLocale: "en",
  apiKey: editorEnabled ? import.meta.env.VITE_COMVI_EDITOR_API_KEY : undefined,
}).use(cdnLoader({ cdnUrl: import.meta.env.VITE_COMVI_CDN_URL }));

export const i18n = editorEnabled ? base.use(inContextEditor()) : base;

await i18n.init();
```

Gating the key is required. Two things keep the editor code out of a production build: the
package's `production` export condition resolves to an entry whose installer is `(i18n) => i18n`,
with no editor bytes, and `inContextEditorPlugin()` returns a no-op when `process.env.NODE_ENV` is
`"production"`. Neither touches your own `createI18n` call, so an ungated `apiKey` still ships in
`dist/assets`, where anyone can read it and overwrite translations with it. Put the key and the
installer behind the same condition, and never widen that condition with a flag a deployed build
can set: a preview deployment is a production build, so the editor would not run there and the key
would still ship. The installer returns the i18n instance type unchanged, so both branches of the
ternary have the same type. On a live site or a preview deployment a translator uses the browser
extension instead: it injects the standalone editor runtime into the page and keeps the key in the
extension.

## Options

| Option                | Default                                                                                  | Behaviour                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `targetElement`       | `document.body`                                                                          | The DOM subtree to watch.                                                                |
| `tagAttributes`       | built-in map                                                                             | HTML tag name to the attributes treated as translated values. Replaces the built-in map. |
| `debug`               | `false`                                                                                  | Verbose console logging.                                                                 |
| `highlightStyle`      | `{ borderColor: '#D97706', backgroundColor: 'rgba(217, 119, 6, 0.12)', borderWidth: 2 }` | The overlay. Its `z-index: 10000` is fixed.                                              |
| `collectContext`      | `true`                                                                                   | Passive context collection while the editor runs.                                        |
| `screenGroupResolver` | none                                                                                     | `() => '/users/:id'`, a PII-free route template shown instead of a URL digest.           |
| `apiKeyOverride`      | none                                                                                     | Overrides `i18n.apiKey` for this plugin only; used by the extension.                     |

`tagAttributes` replaces the built-in map, so `{ img: ['alt'] }` stops the scan of `aria-label`,
`placeholder` and the rest; copy the default and spread it to add to the map. Pass `raw: true` to
`t()` wherever invisible markers must not appear: document titles, `<meta>` content, values you
compare or hash. On `<T>` the equivalent is the `skipPostProcess` prop.

## Next steps

- [In-context editor](https://comvi.io/docs/i18n/plugins/in-context-editor): the default `tagAttributes` map, extension discovery, the standalone runtime.
- [Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader): the loader the editor edits on top of.
- [Devtools API](https://comvi.io/docs/i18n/api/core-devtools): `devtools()`, `instanceId` and `exposeGlobal`.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
