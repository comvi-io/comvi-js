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
import { devtools } from "@comvi/core/devtools";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const editorEnabled = import.meta.env.DEV;

const base = createI18n({
  locale: "en",
  fallbackLocale: "en",
  apiKey: editorEnabled ? import.meta.env.VITE_COMVI_EDITOR_API_KEY : undefined,
}).use(cdnLoader({ cdnUrl: import.meta.env.VITE_COMVI_CDN_URL }));

export const i18n = (editorEnabled ? base.use(inContextEditor()) : base).use(devtools());

await i18n.init();
```

Gating the key is required. Two things keep the editor code out of a production build: the
package's `production` export condition resolves to an entry whose installer is `(i18n) => i18n`,
with no editor bytes, and `inContextEditorPlugin()` returns a no-op when `process.env.NODE_ENV` is
`"production"`. Neither touches your own `createI18n` call, so an ungated `apiKey` still ships in
`dist/assets`, where anyone can read it and overwrite translations with it. Put the key and the
installer behind the same condition, and never widen that condition with a flag a deployed build
can set: a preview deployment is a production build, so the editor would not run there and the key
would still ship. The condition decides only whether the development plugin is installed; the
empty `production` entry is what keeps the editor out of a build. `devtools()` stays outside the
condition: on a live site or a preview deployment a translator edits through the browser extension,
and `devtools()` is what the extension needs. This snippet imports `devtools` from
`@comvi/core/devtools`; every binding re-exports it from its root.

## The browser extension

On a page whose i18n instance composed `devtools()`, the Comvi browser extension loads the editor
when a translator asks for it, and the API key stays in the extension. The site ships no editor
code for this; `devtools()` adds the discovery protocol and a small loader, about 1.2 kB min+gzip
together over the base i18n instance (`core-base` and `core-base-devtools` in
`scripts/size-budgets.json`), of which about 0.7 kB is the loader, new in 0.5.1.

`devtools()` publishes the i18n instance to the extension and installs a loader the extension
calls when a translator clicks **Enable editor**; the site's SDK then inserts one `<script>` from
`https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js`, or
the exact version `devtools({ editorVersion: "0.5.1" })` names. Nothing is requested from the
CDN before that click, and an app that does not call `devtools()` is invisible to the extension.
This needs `@comvi/core` 0.5.1 or newer on the site and the 0.5.1 extension. If the site sends a
Content Security Policy, `script-src` must allow `https://cdn.jsdelivr.net`; if the site enforces
Trusted Types, only a `default` policy whose `createScriptURL` accepts that URL lets the script
load, because the loader assigns a plain string. `style-src` needs no change in current browsers,
because the editor adopts a constructable stylesheet.

## Options

| Option                | Default                                                                                  | Behaviour                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `targetElement`       | `document.body`                                                                          | The DOM subtree to watch.                                                                |
| `tagAttributes`       | built-in map                                                                             | HTML tag name to the attributes treated as translated values. Replaces the built-in map. |
| `debug`               | `false`                                                                                  | Verbose console logging.                                                                 |
| `highlightStyle`      | `{ borderColor: '#D97706', backgroundColor: 'rgba(217, 119, 6, 0.12)', borderWidth: 2 }` | The overlay. Its `z-index: 10000` is fixed.                                              |
| `collectContext`      | `true`                                                                                   | Passive context collection while the editor runs. See below for what it sends.           |
| `screenGroupResolver` | none                                                                                     | `() => '/users/:id'`, a PII-free route template shown instead of a URL digest.           |
| `apiKeyOverride`      | none                                                                                     | Overrides `i18n.apiKey` for this plugin only; used by the extension.                     |

`tagAttributes` replaces the built-in map, so `{ img: ['alt'] }` stops the scan of `aria-label`,
`placeholder` and the rest; copy the default and spread it to add to the map. Pass `markers: false`
to `t()` to turn the invisible markers off for one call when they cause a problem: a comparison
or sort that sees extra characters, a width-sensitive layout, a canvas or library that counts
characters. That string is then not editable in context. On `<T>` the equivalent is
`markers={false}`.

With an API key or the extension, context collection sends the page origin, the keys on screen with
their screen group, and structural and layout signals to the Comvi API; it never sends rendered
text. Grouping screens by a digest or a `screenGroupResolver` template does not hide the origin. Set
`collectContext: false` on the plugin to turn it off. Set it on `createI18n` to also ask the
extension to stop. The extension follows that setting on a page that reports it honestly, but a
hostile page can report it as on; the extension README describes this limit.

## Next steps

- [In-context editor](https://comvi.io/docs/i18n/plugins/in-context-editor): the default `tagAttributes` map, extension discovery, the standalone runtime.
- [Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader): the loader the editor edits on top of.
- [Devtools API](https://comvi.io/docs/i18n/api/core-devtools): `devtools()`, `instanceId`, `exposeGlobal` and `editorVersion`.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
