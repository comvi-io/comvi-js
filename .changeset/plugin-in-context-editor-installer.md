---
"@comvi/plugin-in-context-editor": minor
---

**Added: `inContextEditor(options)` — the lowercase `.with(…)` installer, under both export conditions.**

`@comvi/core` is the base host now, so extension discovery and the plugin host are imports you add. The installer composes both and registers the editor plugin, in one call:

```ts
import { createI18n } from "@comvi/core";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const i18n = createI18n({
  locale: "en",
  apiKey: import.meta.env.VITE_COMVI_EDITOR_API_KEY,
}).with(inContextEditor());
await i18n.init();
```

Discovery is composed FIRST, on purpose: the editor is the one capability whose whole point is being driven from outside the page, so an editor-enabled host announces itself on the `window.__COMVI__` queue without a second `.with(devtools())`. Both attaches are idempotent — an already-composed host keeps its `instanceId`, its queue entry and every registered plugin.

### The host type comes back unchanged, and that is the contract

`inContextEditor` widens nothing. The editor needs no public surface from its caller, and this is the only widening that stays true under the package's `production` export condition, where the installer is literally `(host) => host` — no discovery, no capability, no plugin, no editor bytes, and no import of `@comvi/core/devtools` or `@comvi/core/plugins`. Promising `I18nPluginHostApi` would have been a member that is typed present and absent at the same time, which is the exact failure class this release removes. If you want `use` yourself, compose `.with(plugins())`.

The type is IDENTICAL under both conditions — same name, same signature, same exported `InContextEditorInstaller` — so a `.with(inContextEditor())` chain type-checks and behaves the same whichever entry your bundler picked.

### `InContextEditorPlugin` is unchanged

Both the development factory and its `production` no-op keep their behaviour verbatim, and the installer re-implements no lifecycle: `required`, `timeout`, `onError`, cleanup registration and LIFO destroy all keep running inside the plugin host, because the last thing the installer does is call `use`.

### Putting one in the other's slot is rejected

Nothing is branded — an installer and a plugin are both "a function of the host" — so both cross-uses are type errors, and both are loud at runtime:

- `.use(inContextEditor(…))` fails at `init()`. Under the default entry it stops on the installer's first ensure-step, before discovery or the plugin host is attached. Under `production` there is no ensure-step to stop on, so the identity no-op runs and hands the host back — and a plugin may only return nothing or a cleanup function, so `init()` rejects that too, before anything is queued for teardown.
- `.with(InContextEditorPlugin(…))` calls the plugin against a host with no `registerPostProcessor`, so the invocation is rejected. `.with` remains a dumb pipe: it never inspects, orders or brands what you hand it.

See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.
