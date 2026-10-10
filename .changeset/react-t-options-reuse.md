---
"@comvi/react": patch
---

`useI18n().t()` no longer allocates an options object on every no-params call.

The hook injects the render locale into every translation call, and it did so by building a fresh
`{ locale, ...params }` object every time — so `t("row.label")` down a 1 000-row list allocated
1 000 of them. A call with no params now reuses one frozen `{ locale }` object per render locale.
Calls that pass params are unchanged, including the rule that an explicit `params.locale` wins
over the render locale.

This is the un-namespaced `t()`. With a namespace bound (`useI18n("forms")`), core still builds a
`{ ns, ...params }` object per call, so that form gets one allocation instead of two rather than
none.

The reused object is frozen, because it is now shared across calls. A `postProcess` that writes to
its `params` argument — an input, not a scratch object — now throws instead of silently mutating;
core catches that per processor, skips it and reports it through `onError` with
`source: "post-processor"`, so the render still completes.
