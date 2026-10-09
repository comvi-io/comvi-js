---
"@comvi/core": patch
---

Three composition-hardening fixes on the base instance.

- **Composing or registering after `init()` warns in development.** `.use(loader())`,
  `.use(plugins())` and `registerPlugin()` on an initialized instance used to succeed silently while
  the plugin queue never ran and the initial namespace never loaded. Development now emits one
  warning per instance naming the rule ("compose capabilities before `init()`"); production behaviour
  is unchanged.
- **A plugin on an instance with only the plugins capability gets the actionable capability error in development.**
  A plugin that calls `registerLoader` on an instance with no loader composed now fails with
  `[@comvi/core] This i18n instance has no loader capability. Compose it: .use(attachLoader) …`
  instead of a bare `TypeError`. Production keeps the bare `TypeError` — still loud — and
  carries none of the shim code.
- **`attachDevtools` no longer swallows an `exposeGlobal` flip.** Idempotency is keyed on
  the assigned `instanceId`, so `.use(devtools({ exposeGlobal: false }))` followed by
  `.use(devtools({ exposeGlobal: true, instanceId }))` announces once, with the requested
  id. An already-announced instance is never re-announced, the first id wins, and `destroy()`
  still removes the entry.
