---
"@comvi/core": patch
---

`t()` and `tRaw()` no longer type-check the `"ns:key"` spelling, which the runtime treats as a literal key; write `t("key", { ns })` instead.
