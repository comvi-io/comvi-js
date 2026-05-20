---
"@comvi/core": minor
---

Add a minified UMD/CDN build and improve runtime performance.

- New `dist/comvi-core.global.prod.js` (~7.9 kB gzip) for `<script>` / unpkg / jsDelivr consumers, exposed via the `unpkg` and `jsdelivr` package fields. The main npm ESM/CJS entries remain unminified by design (consumers' bundlers re-minify); only this dedicated CDN artifact is minified.
- Sourcemaps are no longer shipped in the published tarball (smaller install size).
- `formatRelativeTime()` now caches its `Intl.RelativeTimeFormat` instances, matching the existing number/date format caches.
- `dir` is memoized on the active locale, avoiding a per-access `Intl.Locale` construction and regex evaluation.
- Fixed a cross-instance cache bug: clearing translations or destroying one `I18n` instance no longer wipes the shared compiled-template cache for other live instances (template parsing is locale-independent, so the cache stays valid). The template cache is now bounded with insertion-order eviction to prevent unbounded growth. No public API or behaviour change.
