---
"@comvi/core": patch
---

Three composition hardening fixes on the base host.

- **Composing or registering after `init()` warns in development.** `.with(loader())`, `.with(plugins())` and `use()` on an initialized host used to succeed silently while the plugin queue never ran and the initial namespace never loaded. Development now emits one warning per host naming the rule ("compose capabilities before `init()`"); production behaviour is unchanged (no replay, no output — 0 B).
- **A plugin on a plugins-only host gets the actionable capability error in development.** `attachPlugins` installs branded, non-enumerable throwing shims for every `I18nLoaderApi` member when no loader is composed, so a plugin calling `registerLoader` fails with `[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) …` instead of a bare `TypeError`. Dev-only: production keeps the bare `TypeError` (still loud) and the production build carries no shim code — `hasLoaderApi` / `hasPluginHostApi` reject the brand in development and are byte-identical in production. `LOADER_MEMBERS` is exported and pinned to `keyof I18nLoaderApi` by a type-level test.
- **`attachDevtools` no longer swallows an `exposeGlobal` flip.** Idempotency is now keyed on the assigned `instanceId`: `.with(devtools({ exposeGlobal: false }))` followed by `.with(devtools({ exposeGlobal: true, instanceId }))` announces once with the requested id; an already-announced host is never re-announced and the first id wins, with or without a `window` (a windowless-exposed host stays quiet even if a window appears later — the client builds its own host). `destroy()` still removes the entry.
