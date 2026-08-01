---
"@comvi/next": minor
---

Locale routing internals now delegate to the shared `@comvi/locale-routing` package (new runtime dependency, exact-pinned at publish). Two URL behaviors change:

- **Trailing slashes are preserved when a locale prefix is stripped.** `stripLocalePrefix("/de/about/")` now returns `/about/` (was `/about`). Consequences: the middleware no longer normalizes trailing slashes via redirect — a request to `/de/about/` was previously redirected to `/de/about` and is now served as-is; link localization keeps the slash — `localizeHref("/de/about/", "en")` in `as-needed` mode now yields `/about/` (was `/about`).
- **Interior duplicate slashes are no longer collapsed.** `stripLocalePrefix("/de//x")` now returns `//x` (was `/x`), so the middleware no longer issues slash-collapsing redirects for such paths.

Paths without a locale prefix, the pathnames slug map, prefix modes, and root-path handling (`/` ⇄ `/de`) are unchanged.
