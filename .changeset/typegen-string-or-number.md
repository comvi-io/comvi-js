---
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Generated types accept a number for a bare `{name}` and for a `select` variable: such a parameter is now `string | number`, not `string`. `t("errors.count", { count: 3 })` against `"Reported misses: {count}"` no longer fails `tsc`; the runtime always rendered it. A `plural` or `selectordinal` count stays `number`. `comvi typegen` and `comviTypes()` still write byte-identical files, so a file with such a parameter has to be regenerated once after upgrading, or `comvi typegen --check` reports it as stale.
