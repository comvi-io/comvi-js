---
"@comvi/react": minor
---

`<I18nProvider loading | suspense>` opens its first-paint gate when a render without it COMMITS, so a render React abandons changes nothing; a direct `<I18nHandover>` child is never hidden by the gate (a client still loading hydrates a server payload with no mismatch and no request for it). `useI18n()` without a namespace activates `default` too, so an app whose `namespaces` option leaves it out loads it on first use instead of showing it as loading forever. `useFormat()` marks the app mounted: relative time counts from a handed-over `serverNow` during hydration and from the browser clock after.
