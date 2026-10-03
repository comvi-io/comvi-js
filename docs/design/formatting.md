# Formatters are free functions, and the bindings' reactivity asymmetry is deliberate

Status: accepted · Date: 2026-09-14 · Owner decision(s): 0.5.0 base-host convergence — formatting
stays off the instance and off the binding roots (`.changeset/vue-single-package-slim.md`), and the
per-binding reactivity split (`.changeset/spa-parity-use-i18n-members.md`)

## Context

Numbers, dates, currency and relative time follow the active locale, and native `Intl` already does
all four correctly. Bolting them onto the host as methods would put four `Intl` wrappers in every
graph, including the graphs that never format anything. The bindings then raise a second question of
their own: `useI18n()` hands the four back, and a binding can only make them re-render if it builds
them inside a tracked read — which react and vue do and svelte does not. Solid reaches the same
result by reading the locale signal inside each formatter (amended by owner decision F-17).

## Decision

- **On a core host the formatters are free functions taking the host as their first argument.**
  Nothing is bolted onto the instance, so a graph that never formats never pays for it.
- **`Intl` does the formatting; the catalog never does.** The ICU `number`, `date` and `time`
  argument types are not implemented. The catalog chooses grammar — plural category, select branch;
  the code chooses presentation — digits, currency, date style.
- **Every binding hands the same four back off `useI18n()`, together with `dir`**, and how reactive
  they are is allowed to differ per binding. The asymmetry is documented, not levelled.
- **In Svelte, the call goes where the locale is already tracked** — a `$derived` or the markup —
  or the locale is passed explicitly. That one-line rule is stated in the README at the point the
  formatters appear. Solid's formatters read the locale signal themselves, so any call site tracks
  it.
- **Core behaves identically under all of them.** `setLocaleAsync` and the synchronous `locale`
  setter both move what the formatters read.

## Consequences

```ts
import { createI18n, formatCurrency, formatNumber, getTextDirection } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

formatNumber(i18n, 1234.5); // "1,234.5" · "1.234,5" · "1 234,5"
formatCurrency(i18n, 99.99, "USD"); // "$99.99" · "99,99 $"
getTextDirection(i18n.locale); // "ltr" | "rtl" — handles script subtags (ku-Arab → rtl, ks-Deva → ltr)
```

The cross-binding table, which is the fact no single README can carry:

| binding | formatters re-render on a locale change                                                               | `dir`                        |
| ------- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| React   | **yes**. The `formatters` memo closes over the tracked locale and passes it explicitly                | reactive                     |
| Vue     | **yes**. Each assignment defaults its `locale` argument to the reactive `locale` ref                  | reactive (`ComputedRef`)     |
| Svelte  | **no**. "The formatters below are plain functions, not stores", and each reads `i18n.locale` per call | reactive (a `derived` store) |
| Solid   | **yes**. They call core with a locale source whose getter reads `signals.locale()`                    | reactive                     |

React's and Vue's formatters are already inside a tracked read at the point the binding builds them.
Solid's stay plain functions: a function that reads a signal is tracked by whatever JSX expression,
memo or effect calls it, so reading the locale signal inside costs no contract change. An explicit
trailing `locale` argument short-circuits in core before the getter runs. Svelte's are plain function
references handed out once, so making them reactive would mean returning a store per formatter from
a hook documented as returning plain functions.

## Alternatives rejected

- **Formatter methods on the host** — four `Intl` wrappers in every graph, including the ones that
  never format.
- **An ICU format grammar in the catalog** (`{price, number, currency/EUR}`) — a second format
  grammar, a currency table and a skeleton parser, shipped to do worse what `Intl.NumberFormat`
  already does correctly in the platform. Formatting a value is code's job, because code has the
  value's type and a catalog has a string.
- **Levelling Svelte's reactivity** — svelte's hook is documented as returning plain functions;
  making them reactive means returning a store per formatter and changing that contract. Not an
  oversight waiting to be fixed. Solid was levelled in 0.5 (F-17) because a signal read inside a
  plain function needs no contract change.
- **Leaving the asymmetry undocumented** — this table was wrong the day it was written, which is why
  it is pinned to symbols rather than to line numbers and why the Svelte README states the rule inline.

## Where it lives

- `formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime`, `getTextDirection` —
  `packages/core/src/index.ts`
- the `formatters` memo — `packages/react/src/useI18n.ts`; the `useFormatters` selector hook, whose
  identity is stable per `(i18n, locale)` — `packages/react/src/useFormatters.ts`
- the four `this.format*` assignments in the `VueI18n` constructor — `packages/vue/src/VueI18n.ts`
- the same four, each beside that binding's `dir` — `packages/svelte/src/useI18n.ts` and
  `packages/solid/src/useI18n.ts`

## Related

- [Composition](composition.md) · [ICU](icu.md) · [Rich text](rich-text.md) ·
  [Limitations](limitations.md)
