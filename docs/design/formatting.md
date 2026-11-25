# Formatters are functions of the instance; a binding's `useFormat()` follows the locale on screen

Status: accepted · Date: 2026-11-25 · Rewritten for 0.8 (formatters moved to `@comvi/core/format`
and take the instance; messages have no `{x, number}`). The 0.5–0.7 version is in git history.

## Context

Numbers, dates, currency, lists and relative time follow the locale, and `Intl` already formats
them. Methods on the instance would put every formatter into every bundle, including the bundles
that never format. Formatting inside messages (`{price, number}`) would put an argument grammar and
its options into the message compiler and make a translator responsible for number options.

## Decision

- **Messages do not format.** `{x, number}`, `{x, date}` and `{x, time}` are not part of the
  message syntax ([icu.md](icu.md)). A value is formatted in code and passed as a plain `{x}`.
- **The formatters are functions** in `@comvi/core/format`: `formatNumber`, `formatCurrency`,
  `formatDate`, `formatDateRange`, `formatRelativeTime`, `formatList`, `displayName`. Each takes the
  instance first and formats in its locale chain (the locale, its parents, the fallback locales),
  or in the chain of a `locale` argument, as `t()` resolves `{ locale }`. Dates use the instance's
  `timeZone` unless the options name one. `formatNumber` and `formatDate` also accept the name of
  an entry of the instance's `formats` option.
- **One cache.** The formatters share the process-wide `Intl` cache of the message compiler, keyed
  by locale and option values.
- **Each binding's `useFormat()`** (`@comvi/react/format`, `@comvi/vue/format`,
  `@comvi/svelte/format`, `@comvi/solid/format`) returns the same functions bound to the provider's
  instance and to the locale its render shows, and re-renders on a locale change.
- **Relative time has one clock per render.** `formatRelativeTime` counts from the instance's clock:
  its `now` option, the `serverNow` a server handed over, else the running clock. A binding's
  `useFormat().relative()` counts from the handed-over server clock while a component hydrates and
  from the browser's clock for every other render, so a hydration matches the server's text.
  Nothing re-renders as time passes.

```ts title="src/price.ts"
import { createI18n } from "@comvi/core";
import { formatCurrency, formatNumber, formatRelativeTime } from "@comvi/core/format";

const i18n = createI18n({
  locale: "uk",
  fallbackLocale: "en",
  timeZone: "Europe/Kyiv",
  messages: { uk: { total: "Разом: {total}", seen: "Востаннє: {when}" } },
  formats: { number: { compact: { notation: "compact" } } },
});

i18n.t("total", { total: formatCurrency(i18n, 1250, "UAH") });
i18n.t("seen", { when: formatRelativeTime(i18n, Date.now() - 3_600_000) });
formatNumber(i18n, 12_500, "compact");
```

## Consequences

- An app that never formats carries none of this code; one that imports `/format` pays for the
  functions it calls.
- The formatters throw a `RangeError` for a `locale` argument that is not a tag, like `createI18n`.
- A relative time does not tick. A component that needs a live "3 minutes ago" re-renders on its own
  timer.

## Alternatives rejected

- **`{x, number}` and `{x, date}` in messages.** A second grammar in the compiler and in typegen,
  for a job `Intl` does in code; see [limitations](https://comvi.io/docs/i18n/limitations).
- **`{ live: true }` on `relative()`.** A formatter call inside a render cannot own a timer.

## Where it lives

`packages/core/src/format.ts` (the functions, `RelativeTimeOptions`), `packages/core/src/clock.ts`
(the instance clock), `packages/{react,vue,svelte,solid}/src/format*.ts` (`useFormat`).
