---
"@comvi/plugin-in-context-editor": minor
---

**Added: `inContextEditor(options)` — the lowercase `.with(…)` installer, under both export
conditions.** `@comvi/core` is the base host now, so extension discovery and the plugin host
are imports you add; the installer composes both and registers the editor plugin in one
call.

```ts
import { createI18n } from "@comvi/core";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const i18n = createI18n({ locale: "en", apiKey }).with(inContextEditor());
await i18n.init();
```

Discovery is composed too, on purpose: the editor's whole point is being driven from outside
the page, so an editor-enabled host announces itself on the `window.__COMVI__` queue without
a separate `.with(devtools())`. Both attaches are idempotent.

**The host type comes back unchanged, and that is the contract.** `inContextEditor` widens
nothing — the editor needs no public surface from its caller, and this is the only widening
that stays true under the package's `production` export condition, where the installer is
literally `(host) => host`. The type is IDENTICAL under both conditions, so a
`.with(inContextEditor())` chain type-checks and behaves the same whichever entry your
bundler picked. If you want `use` yourself, compose `.with(plugins())`.

`InContextEditorPlugin` is unchanged, and the installer re-implements no lifecycle:
`required`, `timeout`, `onError`, cleanup registration and LIFO destroy keep running inside
the plugin host, because the installer's last act is `use`. Putting one in the other's slot
is a type error and loud at runtime — and under `production` `.use(inContextEditor(…))` is
caught by the return-shape rule instead, because the identity no-op hands the host back.
