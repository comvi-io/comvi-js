<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/editor</h1>

<p align="center">Edit translations inside your running app: hold Alt, click the text, save to Comvi.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/editor"><img src="https://img.shields.io/npm/v/@comvi/editor?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/editor` is the in-context editor the Comvi browser extension puts on a page: a translator
clicks text the app rendered through `t()` and edits it in place. Saves go to the
[Comvi platform](https://comvi.io). The app does not install this package; it composes
`devtools()` on its instance, and the extension does the rest.

## Set up the app

```ts title="src/i18n.ts"
import { createI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";

export const i18n = createI18n({ locale: "en", plugins: [devtools()] });
```

No API key goes into the app: the key stays in the extension.

## Use it

Open the extension on the page and press **Enable editor**.

| Do this                                  | And                                                           |
| ---------------------------------------- | ------------------------------------------------------------- |
| Hold `Alt` (`Option` on macOS) and hover | translated elements light up with an overlay naming their key |
| `Alt` + click a highlighted element      | the edit modal opens on that key                              |
| `Cmd` or `Ctrl` + `S` in the modal       | saves without closing                                         |
| `Escape`                                 | closes the modal, or warns about unsaved edits                |

## How it works

`devtools()` puts the instance on `window.__COMVI__` with a handle. On **Enable editor** the
extension asks the handle to load `dist/standalone.iife.js` of this package from
`https://cdn.jsdelivr.net`, so a Content Security Policy needs that host in `script-src`. The
editor then marks every Comvi instance on the page: each `t()` result carries an invisible frame
naming its instance, namespace and key, and a scanner maps the frames back to keys on the DOM.
Pass `{ markers: false }` to one `t()` call, or `markers={false}` to `<T>`, for a string that is
compared, measured or drawn to a canvas; it is then not editable in context. Markers are not
removed from strings the app sends elsewhere, such as a document title or the clipboard; text
copied from the page into the edit modal is saved without them.

Marking starts in the browser when the editor is enabled: a server render never carries a frame,
and text the browser never renders again (a Next.js Server Component's own output) is not
marked. **Disable** in the extension removes the frames from the text already on the page and
from everything rendered after it.

The extension runs in Chromium, where marked text measures and draws the same as unmarked
text. In WebKit a frame changes the shaping of the neighbouring glyph during an editing session
and breaks Arabic joining, a known defect; without an editor session no page carries a frame in
any browser.

A save goes to the platform for every language in the modal. The page shows the new text at once
in each language whose catalog it has loaded; the others show it once the app loads them from a
catalog that has it. The editor sends no usage context to the platform.

## Read next

- [In-context editor](https://comvi.io/docs/i18n/plugins/in-context-editor): the extension and
  the editor.
- [Devtools API](https://comvi.io/docs/i18n/api/core-devtools): `devtools()` and its handle.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
