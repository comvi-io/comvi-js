# Formatters are free functions, and every binding's formatters follow the locale

Status: accepted · Date: 2026-09-14 · Owner decision(s): 0.5.0 base-host convergence — formatting
stays off the instance and off the binding roots (`.changeset/vue-single-package-slim.md`), and
every binding's formatters follow the locale being rendered, with no per-binding exception
(`.changeset/solid-reactive-formatters.md`, `.changeset/svelte-reactive-formatters.md`)

## Context

Numbers, dates, currency and relative time follow the active locale, and native `Intl` already does
all four correctly. Bolting them onto the host as methods would put four `Intl` wrappers in every
graph, including the graphs that never format anything. The bindings then raise a second question of
their own: `useI18n()` hands the four back, and a call site re-renders on a locale switch only if
the formatter it calls reads the locale reactively. React and Vue build them inside a tracked read;
Solid and Svelte read the reactive locale inside each formatter.

## Decision

- **On a core host the formatters are free functions taking the host as their first argument.**
  Nothing is bolted onto the instance, so a graph that never formats never pays for it.
- **`Intl` does the formatting; the catalog never does.** The ICU `number`, `date` and `time`
  argument types are not implemented. The catalog chooses grammar — plural category, select branch;
  the code chooses presentation — digits, currency, date style.
- **Every binding hands the same four back off `useI18n()`, together with `dir`**, and in every
  binding they follow the locale being rendered: a call in markup or in that framework's derived
  value re-runs on a switch. A trailing `locale` argument overrides the active one. There is no
  per-binding exception to document.
- **`Intl` gets the fallback-locale chain.** Without an explicit `locale` argument the formatters
  pass `[locale, ...fallbackLocales]`, so a locale the runtime has no data for formats in the first
  fallback it does have; an explicit `locale` argument is passed alone.
- **Core behaves identically under all of them.** `setLocale` and the synchronous `locale`
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

| binding | formatters re-render on a locale change                                                     | `dir`                        |
| ------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| React   | **yes**. The `formatters` memo closes over the tracked locale and passes it explicitly      | reactive                     |
| Vue     | **yes**. Each assignment defaults its `locale` argument to the reactive `locale` ref        | reactive (`ComputedRef`)     |
| Svelte  | **yes**. They call core with a locale source whose getter reads `fromStore(locale).current` | reactive (a `derived` store) |
| Solid   | **yes**. They call core with a locale source whose getter reads `signals.locale()`          | reactive                     |

React's and Vue's formatters are already inside a tracked read at the point the binding builds them.
Solid's stay plain functions: a function that reads a signal is tracked by whatever JSX expression,
memo or effect calls it, so reading the locale signal inside costs no contract change. An explicit
trailing `locale` argument short-circuits in core before the getter runs. Svelte's stay plain
functions the same way: `fromStore` subscribes to the locale store when `current` is read inside an
effect, so markup or a `$derived` that calls a formatter re-runs on a switch without `$locale` in the
expression. Outside an effect, and on the server, it reads the store once.

## Alternatives rejected

- **Formatter methods on the host** — four `Intl` wrappers in every graph, including the ones that
  never format.
- **An ICU format grammar in the catalog** (`{price, number, currency/EUR}`) — a second format
  grammar, a currency table and a skeleton parser, shipped to do worse what `Intl.NumberFormat`
  already does correctly in the platform. Formatting a value is code's job, because code has the
  value's type and a catalog has a string.
- **A store or memo per formatter** — Svelte's and Solid's hooks are documented as returning plain
  functions, and a reactive read inside the function makes them follow the locale without changing
  that contract.
- **A documented per-binding exception** — "call it where the locale is tracked, or pass it" is a
  rule every reader has to learn and every call site can break. The table is pinned to symbols
  rather than to line numbers because an earlier version of it was wrong the day it was written.

## Where it lives

- `formatNumber`, `formatDate`, `formatCurrency`, `formatRelativeTime`, `getTextDirection` —
  `packages/core/src/index.ts`; the four formatters are re-exported by name from every binding
  entry (and auto-imported by `@comvi/nuxt`), pinned by each binding's root-entry test
- the `formatters` memo — `packages/react/src/useI18n.ts`; the `useFormatters` selector hook, whose
  identity is stable per `(i18n, locale, fallback chain)` — `packages/react/src/useFormatters.ts`
- the four `this.format*` assignments in the `VueI18n` constructor — `packages/vue/src/VueI18n.ts`
- the same four, each beside that binding's `dir` — `packages/svelte/src/useI18n.ts` and
  `packages/solid/src/useI18n.ts`

## Related

- [Composition](composition.md) · [ICU](icu.md) · [Rich text](rich-text.md) ·
  [Limitations](limitations.md)
