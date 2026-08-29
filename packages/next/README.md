<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/next</h1>

<p align="center">Next.js App Router integration for Comvi i18n — SSR, middleware, and locale routing.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/next"><img src="https://img.shields.io/npm/v/@comvi/next?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/next"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/next?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/next` builds on [`@comvi/react`](../react) with SSR utilities and locale routing for the Next.js App Router. `createNextI18n()` handles i18n setup plus routing config; server-only functions load translations on the server side; client-only entries provide the React provider and locale-aware navigation.

Designed for Next.js 14+ / 15+ with React 18+ / 19+.

📖 **Documentation:** https://comvi.io/docs/i18n/next/

⚖️ **Comparison:** [Comvi vs next-intl](https://comvi.io/compare/next-intl/)

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~7.1 kB minified + gzipped for a default client graph, ~7.2 kB for the server graph (measured, `next` and `react` externalized), zero runtime dependencies.** That is the base host plus the bindings; ICU, async loading, the plugin host and devtools discovery cost only where you compose them. No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor` — one lowercase `.with(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.
- **First-class SSR.** `@comvi/next` and `@comvi/nuxt` ship server-side translation loading, locale-routed layouts, and middleware for redirect-on-detect — no flash of untranslated content.

## Why @comvi/next?

- **No client-side translation flash.** `loadTranslations()` loads translations server-side for Server Components — users see complete content on first load, no suspense waterfall for i18n.
- **Built-in `[locale]` segment routing.** `createNextI18n()` creates routing config for your `[locale]/layout.tsx` setup and pairs it with `createMiddleware()` for automatic locale detection and redirect-on-first-visit.
- **Server-side cache friendly.** Use `loadTranslations()` in Server Components; Next.js can dedupe underlying `fetch()` calls within a request, while the core loader deduplicates concurrent locale/namespace loads.

## Install

```bash
npm install @comvi/next
# Peers: next ^14 || ^15, react ^18 || ^19
```

Upgrading from v0.2.x? See the [CHANGELOG](./CHANGELOG.md).

## Quick start

```ts
// src/i18n/config.ts
import { createNextI18n } from "@comvi/next";

export const nextI18n = createNextI18n({
  locales: ["en", "uk", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  fallbackLocale: "en",
});

nextI18n.i18n.registerLoader({
  en: () => import("./locales/en.json"),
  uk: () => import("./locales/uk.json"),
  de: () => import("./locales/de.json"),
});

export const { i18n, routing } = nextI18n;
```

```ts
// src/i18n/server.ts
import "server-only";
import { setI18n } from "@comvi/next/server";
import { i18n } from "./config";

setI18n(i18n);
```

```tsx
// src/i18n/ComviProvider.tsx
"use client";

import { I18nProvider, type MessagesMap } from "@comvi/next/client";
import { i18n, routing } from "./config";

export function ComviProvider({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: MessagesMap;
}) {
  return (
    <I18nProvider i18n={i18n} locale={locale} messages={messages} routing={routing}>
      {children}
    </I18nProvider>
  );
}
```

```ts
// src/middleware.ts
import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/config";

export default createMiddleware(routing);
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
```

The full setup also includes a `[locale]/layout.tsx` that imports the server registration once, calls `loadTranslations(locale)`, and renders the client wrapper above. See the [documentation](https://comvi.io/docs/i18n/next/) for locale-aware `<Link>`, `useLocalizedRouter`, server/client subpath imports, and the lazy-plugin API.

## Optimizations in v0.3

**Routing components now use `useLocale()`** — `<Link>`, `usePathname()`, and `useLocalizedRouter()` internally switched to the new `useLocale()` hook in v0.3. No behavior change for consumers; routing continues to work identically. Under the hood, this means locale-aware routing skips re-renders on namespace loads and loading-state changes (measurement-confirmed P1 performance improvement).

**Render-time mutation removed** — The internal `i18n.locale` assignment and `i18n.addTranslations()` calls that used to happen in `<I18nProvider>`'s render body have been moved into a `useState` initializer. This is a quality improvement (removes side effects from render) with no API change — `<I18nProvider>` props work identically.

## Error Boundaries

Wrap the client provider in an Error Boundary to handle initialization failures:

```tsx
import React from "react";
import { I18nProvider } from "@comvi/next/client";

class I18nErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <div>Failed to load translations. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}

export function ComviProvider({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: MessagesMap;
}) {
  return (
    <I18nErrorBoundary>
      <I18nProvider i18n={i18n} locale={locale} messages={messages} routing={routing}>
        {children}
      </I18nProvider>
    </I18nErrorBoundary>
  );
}
```

Or use [react-error-boundary](https://github.com/bvaughn/react-error-boundary) for convenience.

## Server-side translation loading

`loadTranslations()` is a server-only function that loads translations for a locale using the i18n instance registered with `setI18n(i18n)`. Call it in Server Components or Server Actions, and pass the result to `<I18nProvider>` to hydrate the client without a flash of untranslated content.

```tsx
// app/[locale]/layout.tsx
import "@/i18n/server";
import { loadTranslations } from "@comvi/next/server";
import { ComviProvider } from "@/i18n/ComviProvider";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await loadTranslations(locale);

  return (
    <html lang={locale}>
      <body>
        <ComviProvider locale={locale} messages={messages}>
          {children}
        </ComviProvider>
      </body>
    </html>
  );
}
```

Next.js deduplicates `fetch()` calls across Server Components within a single request, and the core loader deduplicates concurrent requests for the same locale/namespace.

## Locale routing

Create a `[locale]` dynamic segment in your app directory, and use `createMiddleware()` in `middleware.ts` for locale detection and redirect-on-first-visit.

```tsx
// middleware.ts
import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "@/i18n/config";

export default createMiddleware(routing);
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
```

The middleware extracts locale from the URL path first, then checks cookies and the Accept-Language header in your configured order. On first visit without a stored locale, it detects the user's language and redirects to the localized URL while persisting the choice in a cookie.

For more routing details and custom locale-aware navigation helpers, see the [documentation](https://comvi.io/docs/i18n/next/).

## Capability hooks: `useI18nLoader()` / `useI18nPlugins()`

`@comvi/next/client` re-exports react's 0.5.0 surface, so async loading and the
plugin host are acquired explicitly on the client rather than being handed out
by `useI18n()`:

```tsx
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/next/client";

function Namespaces() {
  const { t } = useI18n("admin");
  const { addActiveNamespace, reloadTranslations, onLoadError } = useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
  // …
}
```

There is no next-specific hook API. Migrating from 0.4.x:
`pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`, or the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## Two hosts, one package: the composed root and the base constructor

`@comvi/next` publishes THREE ways to get an i18n host, and the difference is
worth ten seconds before you pick:

| you call                                         | from                 | what you get                                                         |
| ------------------------------------------------ | -------------------- | -------------------------------------------------------------------- |
| `createNextI18n(options)`                        | `@comvi/next`        | the COMPOSED host + routing + `.use*`, exactly as 0.4.x published it |
| `createI18n(options)`                            | `@comvi/next/client` | the BASE host — capabilities are things you compose, on the client   |
| `createI18n(options)` + `createNextI18nFromHost` | `@comvi/next/server` | the BASE host you compose yourself, handed to the SSR factory        |

The two entries expose the SAME `createI18n`: the client/server split is a
runtime split (which helpers are reachable), never a host-tier split. There is
one direct-host constructor name in this package, on both entries.

### `createNextI18n` — the composed root

Since core converged to a single BASE entry, `createNextI18n` no longer inherits
a composed core: it **composes one explicitly**, inside this package, so its
published behaviour is preserved exactly — ICU, ambient tag syntax, the loader
(with BOTH `registerLoader` overloads, a loader function and a static import
map), the plugin host, nested constructor catalogs, default params and devtools
discovery, in that order.

It is therefore one of exactly two hosts in the repo that carry ICU whether or
not the app asked for it — the other is the CDN global build. Both are
deliberate: this factory preserves published 0.4 behaviour and the CDN global
has no composition step a page could write. `createI18n` on
`@comvi/next/client` and `@comvi/next/server` is the base host and carries
nothing you did not compose.

The host type is published as `NextComposedI18n<D>`, which is exactly
`CreateNextI18nResult<D>["i18n"]`:

```ts
import type { NextComposedI18n } from "@comvi/next";

function withHost(i18n: NextComposedI18n) {
  i18n.registerLoader(async (locale) => import(`./locales/${locale}.json`));
  i18n.registerLoader({ en: () => import("./locales/en.json") }); // both overloads
}
```

Measured: **10120 B** min+gz for the server graph (`fw-next-composed-factory`),
against a 10128 B budget — 8 B of current headroom. Nothing about the call site
changes, and `packages/next/tests/composed-contract.test.ts` pins every
capability a 0.4 caller could reach through `result.i18n`.

### `createI18n` — the base host on both entries

**Upgrading from 0.4.x? Read this.** `createI18n` from `@comvi/next/client` is
the name 0.4 published, and it now builds the BASE host. ICU, tag syntax, the
loader, the plugin host and devtools discovery became things you compose:

| 0.4 behaviour of `createI18n`                         | after                   | loudness                                                             | migration                                    |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| ICU plurals, select, selectordinal                    | not compiled by default | **dev throws; prod renders it literally and reports** `E_ICU_SYNTAX` | see the two ICU shapes below                 |
| loader (`registerLoader`, `reloadTranslations`, …)    | absent until composed   | the loud capability error, at `useI18nLoader()`                      | `.with(loader(map))` / `.with(attachLoader)` |
| `.use(plugin)`, `onMissingKey`                        | absent until composed   | TS error + runtime `TypeError`                                       | `.with(plugins())`, then `use(p)`            |
| devtools discovery (`instanceId`, `window.__COMVI__`) | absent                  | invisible to the browser extension (documented)                      | `.with(devtools({ instanceId }))`            |
| nested constructor catalogs                           | stored verbatim         | dev warning                                                          | `flattenCatalog(…)`, or compose `loader()`   |
| tag markup through `t()` (`"<b>hi</b>"`)              | literal text            | dev warning; prod literal, never a throw                             | render `<T>`, or `import "@comvi/core/tags"` |
| `<I18nProvider>`, every hook, `<T>`, routing          | untouched               | —                                                                    | —                                            |

Staying on the 0.4 semantics with no composition work at all is one line:
`createNextI18n` above is that recipe, preserved.

If your tree was built against 0.5 development, the second constructor name that
briefly sat beside `createI18n` on these two entries for the bare host is
deleted. It never published, so there is no deprecation debt — run
`pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`, which renames it, and
see the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md)
for the rename table.

### ICU has two shapes, and the wrong one throws

`icuCompiler` is a compiler and `icu()` is an installer, so which one you need
depends on **where the catalog comes from**. Both are exported from both
`@comvi/next` entries:

```tsx
// INLINE — the constructor ingests the catalog, so choose the compiler in the
// same call.
import { createI18n, icuCompiler } from "@comvi/next/client";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });

// LATER — a hydrated client catalog, or anything an SSR loader fetches:
// install BEFORE the first catalog reaches the host.
import { createI18n, icu, loader } from "@comvi/next/server";

const host = createI18n({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any
catalog reaches the host — a constructor `translation`, an `addTranslations`
call, or a loader merge — and a later `icu()` throws with own
`code === "E_COMPILER_LOCKED"` before mutating anything. So
`createI18n({ translation }).with(icu())` is invalid by construction: pass
`compiler: icuCompiler` there instead. `CompilerLockedError` is exported for
typing that failure.

A client host is hydrated rather than loaded, so the installer form is the usual
one there: nothing is ingested at construction, and the catalog arrives through
`<I18nProvider messages>`.

## Composed server hosts: `createNextI18nFromHost`

When you want the server to pay only for what it uses, build the host yourself
and hand it to the companion factory — exported from **`@comvi/next/server`** and
nowhere else:

```ts
// i18n/index.ts
import "server-only";
import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () =>
    createI18n({ locale: "en", defaultNs: "default" }).with(
      loader({ uk: () => import("./uk.json") }),
    ),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

`.with(installer)` is core's composition pipe — `host.with(f)` is `f(host)` —
and `loader(map)` attaches the capability **and** registers the map. For a
plain `LoaderFn`, compose `.with(attachLoader)` and call `registerLoader(fn)`
yourself; that keeps the import-map adapter out of the server bundle (it is
+111 B min+gz on this graph), which is the form the size fixture measures.

The server **always** needs the loader — `NextServerHost = WrapperI18nHost & I18nLoaderApi`
— while ICU and tag interpolation enter the graph only if your factory composes
them. Options are routing-only; locale, namespaces, translations, tags, plugins
and the API key belong to the host factory and do not exist on the options type.
The result is exactly `{ i18n, routing }`, with no `.use*` methods and your host
type preserved.

`host()` is not called when the factory returns. The first `result.i18n` access
**or** the first server helper that needs the instance (`getI18n()`,
`loadTranslations()`) resolves it — two entry points into one cell, no required
initialization order, exactly one call.

**Configure the server i18n once per process.** A second `setI18n(other)` used
to overwrite the first silently; it now throws, in development and production,
naming both sources. A same-instance `setI18n()` stays a no-op.

The client recipe is a base host hydrated from the catalog the server
serialized. Whole-app comvi graph, min+gz, `next` and `react` externalized
(`node scripts/size-check.mjs`):

| graph                                                    | min+gz    | row                             |
| -------------------------------------------------------- | --------- | ------------------------------- |
| server, `createNextI18n` (the composed host)             | 10120     | `fw-next-composed-factory`      |
| server, `createNextI18nFromHost` on a composed base host | **7218**  | `fw-next-server-default-loader` |
| client, base host hydrated                               | **7057**  | `fw-next-client-default`        |
| client, base host + `<T>`                                | **8939**  | `fw-next-client-default-t`      |
| client, base host + inline ICU                           | **7936**  | `fw-next-client-icu`            |
| client, ICU + loader + plugins + devtools + `<T>`        | **11580** | `fw-next-client-full-composite` |

Moving the server onto a composed base host saves **2902 B (−28.7%)**. Every row
is gated on its emitted module graph as well as its bytes, at the corpus-wide
measured + 2%. The last row is the migration CEILING for a fully composed 0.4
client, not a parity claim: 0.4 also registered string-API tag syntax ambiently,
and that is now an explicit `@comvi/core/tags` import which neither next entry
re-exports.

## One package: both `@comvi/next` entries

`@comvi/next/client` and `@comvi/next/server` each carry the base host
constructor and the identical nine-name capability toolkit, so a next app never
names `@comvi/core`:

| export                                     | what it is                                                      |
| ------------------------------------------ | --------------------------------------------------------------- |
| `createI18n`                               | core's base host constructor — the same binding on both entries |
| `icu`, `icuCompiler`                       | the two ICU shapes, from core's pure `/icu` subpath             |
| `loader`, `attachLoader`, `flattenCatalog` | from core's pure `/loader` subpath                              |
| `plugins`, `attachPlugins`                 | from core's pure `/plugins` subpath                             |
| `devtools`, `attachDevtools`               | from core's pure `/devtools` subpath                            |

`CompilerLockedError` and `DevtoolsOptions` come with them as types. The server
entry carries the toolkit because `NextServerHost = WrapperI18nHost & I18nLoaderApi`
makes the loader **mandatory** for SSR — the one host an app cannot avoid
composing should not require a second package to compose.

These are **named** re-exports of core's own bindings, from core's pure
subpaths only — never through `@comvi/react`, because webpack development
reconnects a single `export … from` across one `sideEffects: false` package but
not a two-package chain. The ones you do not call are pruned: the
`next-client-default`, `next-client-icu` and `next-server-on-default` matrix
cases assert that every capability subpath an app did not reach for stays out of
its module graph, in webpack and vite, development and production.

Neither entry re-exports `@comvi/core/tags`, the one side-effectful subpath:
importing it registers string-API tag syntax ambiently, and that stays your
app's explicit call. `next-server-on-default` asserts those tag chunks never
reach a server graph at all.

## Rich text with `<T>`

The `<T>` component is inherited from [`@comvi/react`](../react). Embed components in translation strings without raw HTML or unsafe DOM injection.

`<T>` uses React's pure `@comvi/core/rich-text` path and does not register
string-API tag syntax ambiently. Importing or rendering it leaves
`i18n.t("Click <link>here</link>")` literal; import `@comvi/core/tags` explicitly
at your app entry only if the string API itself should parse tags.

```json
{ "help": "Click <link>here</link> for more information." }
```

```tsx
import { T } from "@comvi/next/client";

export function Help() {
  return (
    <T
      i18nKey="help"
      components={{
        link: <a href="/help" />,
      }}
    />
  );
}
```

See the [React README](../react) for the full Rich Text section with tag interpolation examples and validation options.

## ICU MessageFormat — locale-correct grammar, not just singular/plural

ICU MessageFormat handles plurals, ordinals, and select with locale-correct grammar via `Intl.PluralRules` — Comvi i18n inherits the full ICU runtime from the underlying binding.

```tsx
import { useI18n } from "@comvi/next/client";

function Stats() {
  const { t } = useI18n();
  return <p>{t("items", { count: 5 })}</p>;
}
```

See the [@comvi/react ICU section](../react#icu-messageformat--locale-correct-grammar-not-just-singularplural) for the full multilingual examples, ordinals, and select.

## Type-safe translation keys

Extend the `TranslationKeys` interface via declaration merging for autocomplete and parameter validation. Type definitions can be generated automatically from the Comvi Platform via `@comvi/cli` or from local JSON files via `@comvi/vite-plugin`.

```typescript
// src/types/i18n.d.ts
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: never;
    "errors:NOT_FOUND": never;
  }
}
```

```tsx
import { useI18n } from "@comvi/next/client";

export function Welcome() {
  const { t } = useI18n();

  // ✓ Autocomplete, params required
  const msg = t("welcome", { name: "Alice" });

  return <h1>{msg}</h1>;
}
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
t("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
t("typo", { name: "Alice" });
```

For CDN-delivered translations and visual in-context editing, pair with the [Comvi Platform](https://comvi.io) via [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) and [`@comvi/plugin-in-context-editor`](../plugin-in-context-editor).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
