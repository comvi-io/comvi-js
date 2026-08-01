---
"@comvi/plugin-locale-detector": patch
---

Internal cache-write config keys renamed from minified-style `{ck, ls, ss, co, ma}` to `{cookieKey, localStorageKey, sessionStorageKey, cookieOptions, maxAge}`. The object never crosses the package boundary (it is only passed to the internal `writeCaches` helper), so the public options (`lookupCookie`, `lookupLocalStorage`, …) and behavior are unchanged.
