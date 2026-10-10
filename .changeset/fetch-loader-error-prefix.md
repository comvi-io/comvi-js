---
"@comvi/plugin-fetch-loader": patch
---

Errors thrown by this package are prefixed with the package name rather than
`[FetchLoader]`.

`[FetchLoader]` named an export, not the package, so a
`@comvi/plugin-fetch-loader` user reading `[FetchLoader] Request aborted: …`
saw a symbol they never imported. Every message now begins
`[@comvi/plugin-fetch-loader]`, whichever entry point raised it:

```diff
-[FetchLoader] Invalid locale: "../etc"
+[@comvi/plugin-fetch-loader] Invalid locale: "../etc"
```

Only the prefix changes; the rest of every message, the error `name`
(`AbortError` is still `AbortError`) and every thrown type are the same. Code
matching on message text needs updating; code matching on `error.name` does not.
