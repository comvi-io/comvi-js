---
"@comvi/core": patch
---

`icuCompiler` no longer reads an argument whose only comma sits inside a nested pair of braces as a parameter. `{{,}\t}` used to become a parameter named `{,}`, and `{{count, plural, …}}` a parameter named after the whole inner plural. Such an argument now fails like any unsupported ICU syntax, as the default compiler already did: `E_ICU_SYNTAX` at ingestion in development, and in production the braced text renders literally and is reported once through `onError`.
