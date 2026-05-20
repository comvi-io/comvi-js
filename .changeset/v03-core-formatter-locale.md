---
"@comvi/core": minor
---

Add optional `locale` parameter to `formatNumber()`, `formatDate()`, `formatCurrency()`, and `formatRelativeTime()` to override the instance locale on a per-call basis. Existing call sites without the argument continue to work — the helpers fall back to the instance locale. The optional argument enables framework bindings (e.g. `@comvi/react` `useFormatters()`) to thread the React-tracked locale through formatters so output stays in sync with concurrent rendering.

The `I18n` interface in `@comvi/core/types` is updated to match the concrete class signature. Internal Intl format caches now key on `(locale, options)` so different override locales do not serve stale `Intl.NumberFormat` / `Intl.DateTimeFormat` instances.
