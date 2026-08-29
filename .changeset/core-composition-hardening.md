---
"@comvi/core": patch
---

Three composition-hardening fixes on the base host.

- **Composing or registering after `init()` warns in development.** `.with(loader())`,
  `.with(plugins())` and `use()` on an initialized host used to succeed silently while the
  plugin queue never ran and the initial namespace never loaded. Development now emits one
  warning per host naming the rule ("compose capabilities before `init()`"); production
  behaviour is unchanged.
- **A plugin on a plugins-only host gets the actionable capability error in development.**
  A plugin that calls `registerLoader` on a host with no loader composed now fails with
  `[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) …`
  instead of a bare `TypeError`. Production keeps the bare `TypeError` — still loud — and
  carries none of the shim code.
- **`attachDevtools` no longer swallows an `exposeGlobal` flip.** Idempotency is keyed on
  the assigned `instanceId`, so `.with(devtools({ exposeGlobal: false }))` followed by
  `.with(devtools({ exposeGlobal: true, instanceId }))` announces once, with the requested
  id. An already-announced host is never re-announced, the first id wins, and `destroy()`
  still removes the entry.
