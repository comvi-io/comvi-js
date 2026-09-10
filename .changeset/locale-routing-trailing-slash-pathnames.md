---
"@comvi/locale-routing": patch
"@comvi/next": patch
---

Trailing-slash and doubled-slash URLs no longer bypass the `pathnames` map. `/en/about/` and `/en//about` now resolve through the same mapping as `/en/about`, in the middleware rewrite, `localizePathname`, `usePathname` and `localizeUrlObject`, and the trailing slash is preserved on the result. Next's default 308 normalisation masked this; it showed under `trailingSlash: true` or `skipTrailingSlashRedirect: true`.
