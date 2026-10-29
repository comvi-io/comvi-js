---
"@comvi/vue": minor
---

`useI18n().locale` is a `Ref<string>` (was a `WritableComputedRef`): after a failed switch its readers re-render, so a `v-model` control shows the locale on screen again instead of the one it asked for. `useI18n(ns?)` and `<T ns?>` load their namespace (`default` without one) on a server before the component renders (`onServerPrefetch`): `renderToString` waits for it and `handover()` carries it, so a route no longer has to call `i18n.load(ns)` before the render; in a browser they still activate after mount. `useFormat()` marks the app mounted: relative time counts from a handed-over `serverNow` during hydration and from the browser clock after.
