---
"@comvi/locale-routing": patch
"@comvi/next": patch
---

Trailing-slash and doubled-slash URLs no longer bypass the `pathnames` map. `/en/about/` and `/en//about` now resolve through the same mapping as `/en/about`, in the middleware rewrite, `localizePathname`, `usePathname` and `localizeUrlObject`, and the trailing slash is preserved on the result. Next's default 308 normalisation masked this; it showed under `trailingSlash: true` or `skipTrailingSlashRedirect: true`.

A `pathnames` key or value that itself ends in `/` is matched on the same trimmed form as the input, so `"/about/"` as a key no longer self-redirects forever and `"/ueber-uns/"` as a value keeps its reverse mapping. A run of slashes left at the start of the path after the locale prefix is stripped collapses to one, so `/en//evil.com` can no longer become the protocol-relative `//evil.com`.
