---
"@comvi/core": minor
---

New T-core pipeline: `prepareTranslation(i18n, props)` is exported from `@comvi/core/tags` (deliberately not the root — it is meaningless without tag machinery and would drag tag code into slim graphs). It absorbs the `<T>` plumbing previously duplicated across the vue/react/solid/svelte wrappers — marker-based handler transport (`pendingHandlers` + `getPendingHandlerName`), `childrenToArray`, reserved-prop forwarding (`ns`/`locale`/`fallback`/`raw` override same-named `params` keys only when defined), and the missing-translation check (`isMissing`) — and passes the tag syntax extension per call, so `<T>` rendering never depends on ambient registration or import order.

Supporting this, `TranslationParams` gains a reserved `tagInterpolation` key: per-call tag-interpolation options merged over the instance-level option for that call only (`extensions` are unioned, other fields override). `tagInterpolation` joins `ns`/`locale`/`fallback`/`raw` as a call-control key and is rejected in `defaultParams`.
