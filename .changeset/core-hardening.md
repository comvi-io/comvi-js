---
"@comvi/core": patch
---

State and input hardening:

- `addTranslations` / the `translation` option no longer mutate the caller's object (`Object.setPrototypeOf` removed); flat catalogs are shallow-copied.
- Non-string catalog leaves no longer crash `t()`: arrays/numbers are coerced with `String()` (dev warning), `null`/`undefined` leaves are dropped.
- `isInitializing` stays `true` for the whole `init()`, even when a locale detector triggers a locale change mid-init.
- Reverting to the current locale while another locale change is in flight now cancels that change (last request wins).
- `clearTranslations()` / `reloadTranslations()` cancel matching in-flight namespace loads, so stale responses can't repopulate a cleared cache and reload always fetches fresh data.
- Per-call `fallback` now skips the instance-level `onMissingKey` option (registered callbacks still fire).
