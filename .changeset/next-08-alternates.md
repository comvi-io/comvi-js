---
"@comvi/next": minor
---

`getAlternates(routing, { locale, href })` from `@comvi/next/routing` returns a page's `alternates` for `generateMetadata`: the canonical path in this locale, one hreflang per locale and `x-default` (the default locale's path), each exactly what `getPathname` returns for that locale (prefix mode, `pathnames`). `href` is the page's `pathnames` key: no locale prefix, no query, no hash. With `localePrefix: "never"` it returns only `canonical`. An unknown locale warns and is not rejected. It returns paths: set `metadataBase` in the root layout, or Next.js leaves the links relative. It reads no request API, so a static page stays static.
