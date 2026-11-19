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
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/plugin-in-context-editor` lets a translator click any text the app rendered through `t()`
and edit it in place, in the browser. Saves go to the [Comvi platform](https://comvi.io) over its
API, so it needs a Comvi project and an API key; use it in development builds, and the Comvi
browser extension on deployed sites.

## Install

```bash
npm install @comvi/plugin-in-context-editor
# Peer: @comvi/core, which every framework package already brings
```

## Set up

In `src/i18n.ts`:

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

export const i18n = createI18n({
  locale: "en",
  apiKey: import.meta.env.DEV ? import.meta.env.VITE_COMVI_EDITOR_API_KEY : undefined,
  loader: cdn(import.meta.env.VITE_COMVI_CDN_URL),
}).use(inContextEditor());

await i18n.init();
```

Create an API key in the project's settings with project read plus translation read and write;
with read alone the editor loads but every save fails. The editor reads the key off
`i18n.apiKey`. Compose a loader
or an inline `messages` catalog next to it: the editor can only edit text the app rendered.

**An API key in a browser bundle is readable by every visitor, and this one can overwrite
translations.** The `import.meta.env.DEV` test keeps it out of a build: Vite replaces it with
`false`, and the bundler drops the key with the dead branch. Never widen that condition with a
flag a deployed build can set; a preview deployment is a production build.

## Use it

| Do this                                  | And                                                           |
| ---------------------------------------- | ------------------------------------------------------------- |
| Hold `Alt` (`Option` on macOS) and hover | translated elements light up with an overlay naming their key |
| `Alt` + click a highlighted element      | the edit modal opens on that key                              |
| `Cmd` or `Ctrl` + `S` in the modal       | saves without closing                                         |
| `Escape`                                 | closes the modal, or warns about unsaved edits                |

## Gate it out of production

The same `src/i18n.ts`, with the key and the installer behind one condition and `devtools()` for
the browser extension:

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";
import { cdn } from "@comvi/core/cdn";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const editorEnabled = import.meta.env.DEV;

const base = createI18n({
  locale: "en",
  fallbackLocale: "en",
  apiKey: editorEnabled ? import.meta.env.VITE_COMVI_EDITOR_API_KEY : undefined,
  loader: cdn(import.meta.env.VITE_COMVI_CDN_URL),
});

export const i18n = (editorEnabled ? base.use(inContextEditor()) : base).use(devtools());

await i18n.init();
```

### How it works

`inContextEditor()` adds a post-processor that wraps every `t()` result in invisible characters
encoding the key, and a scanner that maps those characters back to keys on the rendered DOM. With
no key configured the plugin starts in demo mode: the console says
`[@comvi/plugin-in-context-editor] Running in demo mode - API key not configured. Changes cannot be saved.`
and a click opens a panel naming the key. A bundler that resolves the `production` export condition
gets an entry whose installer is `(i18n) => i18n`, so the editor's code stays out of that build. In
the default entry, `inContextEditorPlugin()` returns a no-op when `NODE_ENV` is `"production"`: the
editor does not start, but its code can still be bundled.
Neither touches your `createI18n` call, which is why the key is yours to gate.

`devtools()` stays outside the condition. It publishes the i18n instance to the Comvi browser
extension, which loads the editor on a deployed site when a translator clicks **Enable editor**;
the key stays in the extension and the site ships no editor code. The React, Vue, Svelte, Solid
and Next.js packages re-export `devtools` from their root; on Nuxt it comes from
`@comvi/nuxt/i18n`. On that click the loader `devtools()` installed inserts one `<script>` from
`https://cdn.jsdelivr.net` into the page, so a Content Security Policy needs that host in
`script-src`. On a page that sets `require-trusted-types-for 'script'`, the site's `default`
policy must return that URL from `createScriptURL`, because the loader assigns `src` as a plain
string, and `vue` must be in the `trusted-types` directive for the editor's Vue runtime; without
it the editor loads but its UI is blocked.

## Options

| Option                | Default                                                                                  | Behaviour                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `targetElement`       | `document.body`                                                                          | The DOM subtree to watch.                                                                |
| `tagAttributes`       | built-in map                                                                             | HTML tag name to the attributes treated as translated values. Replaces the built-in map. |
| `debug`               | `false`                                                                                  | Verbose console logging.                                                                 |
| `highlightStyle`      | `{ borderColor: '#D97706', backgroundColor: 'rgba(217, 119, 6, 0.12)', borderWidth: 2 }` | The overlay.                                                                             |
| `collectContext`      | `true`                                                                                   | Sends the page origin and the keys on screen to Comvi while the editor runs.             |
| `screenGroupResolver` | none                                                                                     | `() => '/users/:id'`, a route template shown instead of a URL digest.                    |
| `apiKeyOverride`      | none                                                                                     | Overrides `i18n.apiKey` for this plugin only; used by the extension.                     |

Pass `markers: false` in the params of one `t()` call to leave its result unmarked, for a string
that is compared, sorted, measured or drawn to a canvas; that string is then not editable in
context. On `<T>` the prop is `markers={false}`. With an API key or the extension, context
collection sends the page origin, the keys on screen with their screen group, and structural and
layout signals to the Comvi API; it never sends rendered text. Grouping screens by a digest or a
`screenGroupResolver` template does not hide the origin. `collectContext: false` on the plugin
turns it off, and on `createI18n` it also asks the extension to stop.

## Read next

- [In-context editor](https://comvi.io/docs/i18n/plugins/in-context-editor): the default `tagAttributes` map, extension discovery, the standalone runtime.
- [Fetch loader](https://comvi.io/docs/i18n/plugins/fetch-loader): `cdn()` of `@comvi/core/cdn`, the loader the editor edits on top of.
- [Devtools API](https://comvi.io/docs/i18n/api/core-devtools): `devtools()`, `instanceId`, `exposeGlobal` and `editorVersion`.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
