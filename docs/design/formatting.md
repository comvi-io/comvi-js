# Locale-aware formatting: free functions, and four different reactivity answers

Design note. The package READMEs name the formatters their binding hands back. This file is why they
are free functions on core, and where the four bindings disagree about reactivity.

The host is the i18n instance `createI18n` returns.

## Free functions, not members

Numbers, dates, currency and relative time follow the active locale via native `Intl`. On a core
host they are free functions that take the host as their first argument. Nothing is bolted onto the
instance, so a graph that never formats never pays for it:

```ts
import {
  createI18n,
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
  getTextDirection,
} from "@comvi/core";

const i18n = createI18n({ locale: "en" });

formatNumber(i18n, 1234.5); // "1,234.5" · "1.234,5" · "1 234,5"
formatNumber(i18n, 0.75, { style: "percent" }); // "75%"
formatDate(i18n, new Date(), { dateStyle: "long" }); // "January 15, 2025" · "15. Januar 2025"
formatCurrency(i18n, 99.99, "USD"); // "$99.99" · "99,99 $"
formatRelativeTime(i18n, -2, "hour"); // "2 hours ago" · "vor 2 Stunden"

getTextDirection(i18n.locale); // "ltr" | "rtl" — handles script subtags (ku-Arab → rtl, ks-Deva → ltr)
```

`setLocaleAsync` and the synchronous `locale` setter both move what these read:

```ts
import { createI18n, formatNumber } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

await i18n.setLocaleAsync("de"); // or the synchronous setter: i18n.locale = "de"

formatNumber(i18n, 1234.5); // "1.234,5"
```

## The four bindings do not agree on reactivity

Every framework binding hands the same four back off `useI18n()`, together with `dir`. How
_reactive_ they are differs between the bindings; core behaves the same under all of them:

| binding | formatters re-render on a locale change                                                               | `dir`                        |
| ------- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| React   | **yes**. The `formatters` memo closes over the tracked locale and passes it explicitly                | reactive                     |
| Vue     | **yes**. Each assignment defaults its `locale` argument to the reactive `locale` ref                  | reactive (`ComputedRef`)     |
| Svelte  | **no**. "The formatters below are plain functions, not stores", and each reads `i18n.locale` per call | reactive (a `derived` store) |
| Solid   | **no**. They call core with the host and read no signal, while `dir` reads `signals.locale()`         | reactive                     |

Where to look, by symbol rather than by line, because this table was wrong the day it was written:
the `formatters` memo in `packages/react/src/useI18n.ts` and the `useFormatters` hook in
`packages/react/src/useFormatters.ts`; the four `this.format*` assignments in the `VueI18n`
constructor, `packages/vue/src/VueI18n.ts`; the same four on the object returned by
`packages/svelte/src/useI18n.ts` and `packages/solid/src/useI18n.ts`, each beside that binding's
`dir`.

This asymmetry is not an oversight waiting to be levelled. React's and Vue's formatters are already
inside a tracked read at the point the binding builds them; Svelte's and Solid's are plain function
references handed out once, and making them reactive would mean returning a store or a memo per
formatter from a hook that is documented as returning plain functions.

**In Svelte and Solid, put the formatter call where the locale is already tracked** (a
`$:`/`$derived`, a `createMemo`, or the template) or pass the locale yourself. That is a one-line
rule, and it is stated in both READMEs at the point the formatters appear.

React additionally publishes `useFormatters()`, a selector hook whose identity is stable per
`(i18n, locale)` — for a component that formats and never translates.

## Why `Intl` rather than a formatting grammar

The ICU `number`, `date` and `time` argument types are deliberately not implemented (see
[ICU](icu.md)). Formatting a value is code's job, and code has the value's type; a catalog has a
string. Pushing `{price, number, currency/EUR}` into the template would mean shipping a second
format grammar, a currency table and a skeleton parser to do worse what `Intl.NumberFormat` already
does correctly in the platform.

So the division is: the catalog chooses grammar (plural category, select branch), the code chooses
presentation (digits, currency, date style). `formatCurrency(i18n, amount, "USD")` then interpolates
as a plain `{param}`.

## Related

- [Composition](composition.md) · [ICU](icu.md) · [Rich text](rich-text.md) ·
  [Limitations](limitations.md)
