---
"@comvi/vue": patch
---

Internal dedupe, behavior-preserving: the `VueI18n` constructor's event→reactivity bridge now consumes core's canonical `subscribeToRevision` helper (an event-name switch preserves the exact per-event semantics for the locale/loading/cache/config refs); `UseI18nReturn`'s `t`/`tRaw` overload blocks are replaced by core's `TranslateFn` type (inference unchanged).
