---
"@comvi/core": minor
---

Missing interpolation parameters now render as the literal placeholder instead of silently
disappearing, governed by the new `missingParam` option (default `"literal"`).

Before: `t("greet")` with `greet: "Hello, {name}!"` produced `"Hello, !"`. Now it produces
`"Hello, {name}!"`, plus one dev-mode warning per (template, parameter) pair. This aligns
with ICU MessageFormat and every major i18n runtime, and makes missing data visible instead
of corrupting copy.

- A parameter that is absent or `undefined` renders as `{name}` under `"literal"`.
- A parameter explicitly set to `null` renders as an empty string in BOTH modes — `null`
  stays the intentional-erasure escape.
- Apps depending on the old silent-drop behaviour can opt out with
  `createI18n({ …, missingParam: "drop" })`.

The semantics are identical across every render path.
