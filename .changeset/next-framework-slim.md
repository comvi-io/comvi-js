---
"@comvi/next": minor
---

**BREAKING (0.x minor, WATCHDOG policy):** `@comvi/next` gains a server factory that takes
the host you composed, and the server i18n becomes a once-cell that refuses two
configuration sources.

**New: `createNextI18nFromHost(host, options)`**, exported from `@comvi/next/server` and
nowhere else. `createNextI18n` keeps its exact signature and behaviour.

```ts
import "server-only";
import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () => createI18n({ locale: "en", defaultNs: "default" }).with(loader(importMap)),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

`NextServerHost<D> = WrapperI18nHost<D> & I18nLoaderApi` — the server always needs the
loader; ICU and tag interpolation enter the graph only if your factory composes them.
Options are **routing only**; locale, fallback, namespaces, translations, API key, tags/ICU,
loader and plugins belong to the host factory and do not exist on the options type. The
result is exactly `{ i18n, routing }` — no `.use*` methods — and your host type is preserved
exactly. `host()` is resolved lazily by the first `result.i18n` access or the first server
helper that needs the instance: exactly once, memoized, in either order. A factory that
throws leaves the cell retryable; one that reads back the instance it is constructing throws
a cycle error instead of recursing.

**BREAKING: `setI18n` no longer overwrites silently.** 0.4.x let a second `setI18n(other)`
replace the instance, last write wins. It now throws, in development **and** production,
naming both sources:

```
[comvi/next] i18n already configured by createNextI18nFromHost(); setI18n() is a second source. Configure it once — only a same-instance setI18n() repeats.
```

`setI18n(i18n)` keeps its exact signature and stays the supported way to configure a
`createNextI18n` result, and repeating it with the **same** instance is a no-op (setup
modules commonly re-run). Migration: configure from one source, once per process. Test
suites that re-`setI18n`'d between cases need a fresh cell — vitest isolates module state
per test file, and in-repo suites call the `@internal` `_resetServerI18n()` from
`@comvi/next/dist/server/cache`.

The client inherits react's hook migration verbatim: `@comvi/next/client` exports
`useI18nLoader()` and `useI18nPlugins()` alongside `useI18n`, and there is no next-specific
hook API. Its documented recipe is a base host hydrated from the catalog the server
serialized, through `<I18nProvider messages>`. Run
`pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`; see the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §6.
