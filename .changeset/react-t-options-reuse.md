---
"@comvi/react": patch
---

`useI18n().t()` no longer allocates an options object per call.

The hook injects the render locale into every translation call, and it did so by building a fresh
`{ locale, ...params }` object every time — so `t("row.label")` down a 1 000-row list allocated
1 000 of them. A call with no params now reuses one frozen `{ locale }` object per render locale.
Calls that pass params are unchanged, including the rule that an explicit `params.locale` wins
over the render locale.
