---
"@comvi/core": minor
---

New T-core pipeline: `prepareTranslation(i18n, props)` ships on a tag-toolbox subpath, deliberately not on the root — it is meaningless without tag machinery and would drag tag code into base-host graphs. It absorbs the `<T>` plumbing previously duplicated across the vue/react/solid/svelte wrappers — marker-based handler transport (`pendingHandlers` + `getPendingHandlerName`), `childrenToArray`, reserved-prop forwarding (`ns`/`locale`/`fallback`/`raw` override same-named `params` keys only when defined), and the missing-translation check (`isMissing`) — and passes the tag syntax extension per call, so `<T>` rendering never depends on ambient registration or import order. It landed on `@comvi/core/tags`, whose import registers tag syntax ambiently; the single-entry convergence in this same release gave it a PURE home, `@comvi/core/rich-text`, which carries the identical pipeline and registers nothing. `@comvi/core/tags` re-exports it unchanged beside that registration, and every framework `<T>` imports the pure seam.

Supporting this, `TranslationParams` gains a reserved `tagInterpolation` key: per-call tag-interpolation options merged over the instance-level option for that call only (`extensions` are unioned, other fields override). `tagInterpolation` joins `ns`/`locale`/`fallback`/`raw` as a call-control key and is rejected in `defaultParams`.
