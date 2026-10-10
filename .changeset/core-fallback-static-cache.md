---
"@comvi/core": patch
---

`t(key, { fallback })` no longer renders an empty string when the fallback text is identical to a static catalog value that was already translated (the static-template cache placeholder was being rendered through the token path).
