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

Comvi i18n is a framework-agnostic internationalization library with type-safe translations, real ICU MessageFormat, and a small bundle.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`). Translators see clean markup, and you decide what each tag renders to. No raw HTML, no unsafe DOM injection, and no splitting a sentence across template fragments.
- **ICU `plural`, `selectordinal` & `select`.** Locale-correct grammar via `Intl.PluralRules`, including Polish, Ukrainian, Arabic, Welsh and the rest. It is the same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~7.1 kB minified + gzipped for a default client graph, ~7.2 kB for the server graph (measured, `next` and `react` externalized), zero runtime dependencies.** That is the base host plus the bindings; ICU, async loading, the plugin host and devtools discovery cost only where you compose them. No `eval` or `new Function` anywhere, so it runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`, one lowercase `.use(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt), so switching frameworks doesn't mean relearning your i18n layer.
- **SSR support.** `@comvi/next` and `@comvi/nuxt` ship server-side translation loading, locale-routed layouts, and middleware for redirect-on-detect, so there is no flash of untranslated content.

## Why @comvi/next?

- **No client-side translation flash.** `loadTranslations()` loads translations server-side for Server Components, so users see complete content on first load, with no suspense waterfall for i18n.
- **Built-in `[locale]` segment routing.** `createNextI18n()` creates routing config for your `[locale]/layout.tsx` setup and pairs it with `createMiddleware()` for automatic locale detection and redirect-on-first-visit.
- **Server-side cache friendly.** Use `loadTranslations()` in Server Components; Next.js can dedupe underlying `fetch()` calls within a request, while the core loader deduplicates concurrent locale/namespace loads.

## Install

```bash
npm install @comvi/next server-only
# Peers: next ^14 || ^15, react ^18 || ^19
```

`server-only` is the guard on `src/i18n/server.ts` below: importing that module
from a Client Component becomes a build error instead of a leaked host. It is
its own package, so declare it in `dependencies` rather than relying on a
transitive copy.

Upgrading from v0.2.x? See the [CHANGELOG](./CHANGELOG.md).

## Quick start

```ts title="src/i18n/config.ts"
// src/i18n/config.ts
import { createNextI18n, loader } from "@comvi/next";
// The URL rules live in `./routing` (below) and are SPREAD in, so the host and
// the middleware cannot drift apart. Declare `locales` in both files and `/uk/…`
// becomes a real route in one and an unknown one in the other.
import { routing } from "./routing";

export const { i18n } = createNextI18n({
  ...routing,
  fallbackLocale: "en",
}).use(
  loader({
    en: () => import("./locales/en.json"),
    uk: () => import("./locales/uk.json"),
    de: () => import("./locales/de.json"),
  }),
);

export { routing } from "./routing";
```

`.use(installer)` is the one composition verb, on this result as on every
host: `loader(map)` registers the import-map loader, a plugin package goes in
through its lowercase installer, and a plugin scoped to one runtime goes
through `nextPlugin(…)` / `nextPluginLazy(…)` from the same specifier (see
[Composing onto the result](#composing-onto-the-result-useinstaller)). This
file is imported by BOTH runtimes, which is why its installers come from the
package root: `@comvi/next/client` is a `"use client"` module and
`@comvi/next/server` reaches `next/headers`.

```ts title="src/i18n/server.ts"
// src/i18n/server.ts
import "server-only";
import { setI18n } from "@comvi/next/server";
import { i18n } from "./config";

setI18n(i18n);
```

```tsx title="src/i18n/ComviProvider.tsx"
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

```ts title="src/i18n/routing.ts"
// src/i18n/routing.ts — the URL rules, and nothing else.
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({
  locales: ["en", "uk", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
```

```ts title="src/middleware.ts"
// src/middleware.ts
import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
```

**Import the routing object from a core-free module, not from the module that
builds the host.** `middleware.ts` runs in the Edge runtime, and an Edge isolate
ships and EXECUTES every module its entry reaches on each cold start. A
`middleware.ts` that does `import { routing } from "./i18n/config"` therefore
pulls core, ICU, the loader, the plugin host, devtools and the tag grammar into
middleware — and runs `createNextI18n()` and `registerLoader()` there — for one
plain object: 30.3 KB across 25 modules, against 3.8 KB across 7 with the
`defineRouting` file above (esbuild, minified, Next's externals). Spread the
same object into `createNextI18n({ ...routing, … })` in `src/i18n/config.ts` so
there is still exactly one source of truth for the URL rules.

The full setup also includes a `[locale]/layout.tsx` that imports the server registration once, calls `loadTranslations(locale)`, and renders the client wrapper above. See the [documentation](https://comvi.io/docs/i18n/next/) for locale-aware `<Link>`, `useLocalizedRouter`, server/client subpath imports, and the runtime-scoped plugin installers.

## Quickstart: inline catalog, App Router

The smallest complete app: one static catalog, no loader, no CDN. `createNextI18n`
ingests the whole thing at construction, so there is nothing to fetch and no
loading state to render for.

```ts title="src/i18n.ts" check=group=next-quickstart-inline
import { createNextI18n, icuCompiler } from "@comvi/next";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  // The 0.5 default is already `icuCompiler`, named here so the plural rule
  // below is legible without cross-referencing "ICU is one option" further down.
  compiler: icuCompiler,
  // `"<locale>:<namespace>"` keys. A colon-less key is the LOCALE alone and
  // its object is flattened into the default namespace, so a nested
  // `{ en: { default: { greeting } } }` would define the key
  // `default.greeting` and `t("greeting")` would render the literal key.
  translation: {
    "en:default": {
      greeting: "Hello, {name}!",
      items: "{count, plural, one {# item} other {# items}}",
    },
    "uk:default": {
      greeting: "Привіт, {name}!",
      items: "{count, plural, one {# товар} few {# товари} many {# товарів} other {# товару}}",
    },
  },
});
```

```ts title="src/i18n.server.ts" check=group=next-quickstart-inline
// A separate module, imported ONLY on the server: getI18n() and
// loadTranslations() read the instance this registers, and the "server-only"
// package turns an accidental client import into a build error.
import "server-only";
import { setI18n } from "@comvi/next/server";
import { i18n } from "./i18n";

setI18n(i18n);
```

```tsx title="src/app/[locale]/I18nClientProvider.tsx" check=group=next-quickstart-inline
"use client";

import { I18nProvider } from "@comvi/next/client";
import { i18n } from "@/i18n";

// A "use client" wrapper that imports the instance itself: Next.js cannot pass
// a class instance from a Server Component to a Client Component, so the
// layout below hands this component a locale, never the host.
export function I18nClientProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  return (
    <I18nProvider i18n={i18n} locale={locale}>
      {children}
    </I18nProvider>
  );
}
```

```tsx title="src/app/[locale]/layout.tsx" check=group=next-quickstart-inline
import { notFound } from "next/navigation";
import { routing } from "@/i18n";
import { I18nClientProvider } from "./I18nClientProvider";
import "../globals.css";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale)) {
    notFound();
  }

  return (
    <html lang={locale}>
      <body>
        <I18nClientProvider locale={locale}>{children}</I18nClientProvider>
      </body>
    </html>
  );
}
```

```tsx title="src/app/[locale]/page.tsx" check=group=next-quickstart-inline
// Imported for its side effect: setI18n() must run before getI18n() does.
import "@/i18n.server";
import { getI18n } from "@comvi/next/server";
import { Greeting } from "./Greeting";

export default async function HomePage() {
  const { t } = await getI18n();

  return (
    <div>
      <h1>{t("greeting", { name: "Server" })}</h1>
      <p>{t("items", { count: 3 })}</p>
      <Greeting />
    </div>
  );
}
```

```tsx title="src/app/[locale]/Greeting.tsx" check=group=next-quickstart-inline
"use client";

import { useI18n } from "@comvi/next/client";

export function Greeting() {
  const { t } = useI18n();
  return <p>{t("greeting", { name: "Client" })}</p>;
}
```

Nothing here calls `loadTranslations()` or passes `messages` to `<I18nProvider>`:
the catalog is inline in `src/i18n.ts`, so both the server render and the
client host already have it at construction — there is nothing to hydrate.
Add a loader (see the next quickstart) the moment a catalog needs to be fetched
rather than shipped in the bundle.

## Quickstart: `@comvi/plugin-fetch-loader/cdn`, App Router

A remote catalog, served from a CDN. The one file that changes shape is the
host: `.use(cdnLoader({ cdnUrl }))` composes the loader and plugin capabilities
and registers the CDN plugin, in one step, on top of the same
`createNextI18n(...)` this package always starts from.

```ts title="src/i18n/config.ts" check=group=next-quickstart-cdn
import { createNextI18n, icuCompiler } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project>" }));
```

```ts title="src/i18n/server.ts" check=group=next-quickstart-cdn
import "server-only";
import { setI18n } from "@comvi/next/server";
import { i18n, routing } from "./config";

setI18n(i18n);

export { i18n, routing };
export { getI18n, loadTranslations } from "@comvi/next/server";
```

```tsx title="src/app/[locale]/I18nClientProvider.tsx" check=group=next-quickstart-cdn
"use client";

import { I18nProvider } from "@comvi/next/client";
import type { MessagesMap } from "@comvi/next/client";
import { i18n } from "@/i18n/config";

export function I18nClientProvider({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages?: MessagesMap;
}) {
  return (
    <I18nProvider i18n={i18n} locale={locale} messages={messages}>
      {children}
    </I18nProvider>
  );
}
```

```tsx title="src/app/[locale]/layout.tsx" check=group=next-quickstart-cdn
import { notFound } from "next/navigation";
import { routing, loadTranslations } from "@/i18n/server";
import { I18nClientProvider } from "./I18nClientProvider";
import "../globals.css";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale)) {
    notFound();
  }

  // Loaded server-side and handed to the client as `messages`, so first paint
  // never flashes untranslated content or races the CDN request.
  const messages = await loadTranslations(locale);

  return (
    <html lang={locale}>
      <body>
        <I18nClientProvider locale={locale} messages={messages}>
          {children}
        </I18nClientProvider>
      </body>
    </html>
  );
}
```

```tsx title="src/app/[locale]/page.tsx" check=group=next-quickstart-cdn
import { getI18n } from "@/i18n/server";
import { Greeting } from "./Greeting";

export default async function HomePage() {
  const { t } = await getI18n();

  return (
    <div>
      <h1>{t("greeting", { name: "Server" })}</h1>
      <Greeting />
    </div>
  );
}
```

```tsx title="src/app/[locale]/Greeting.tsx" check=group=next-quickstart-cdn
"use client";

import { useI18n } from "@comvi/next/client";

export function Greeting() {
  const { t } = useI18n();
  return <p>{t("greeting", { name: "Client" })}</p>;
}
```

**Never compose `localeDetector()` on `src/i18n/config.ts`.** It lives at
module scope and is process-wide on the App Router, so the detector would run
once, at the host's `init()`, and the first request's headers would pin the
locale for every later render. A locale detector belongs behind
`nextPlugin(LocaleDetector(…), { runtime: "client" })` instead — see
[Composing onto the result](#composing-onto-the-result-useinstaller).

**How the hydration-side client host gets ICU and the loader.** `src/i18n/config.ts`
is imported on both sides — by `src/i18n/server.ts` (`"server-only"`) and, one
hop further, by `I18nClientProvider.tsx` (`"use client"`) — because Next.js
cannot pass a class instance from a Server Component to a Client Component
(`packages/next/src/client/I18nProvider.tsx`'s doc comment states this
constraint; `I18nClientProvider` above is the workaround every 0.5 quickstart
in this README uses). Next therefore bundles `config.ts` into BOTH the server
build and the client build, and each build EVALUATES the module independently:
`createComposedNextI18n` (`packages/next/src/composedHost.ts`) runs once on the
server, producing the instance `setI18n()` registers, and runs again inside the
browser, producing a second, unrelated instance, when the client bundle
executes `config.ts` to get `i18n` for `<I18nProvider i18n={i18n}>`. The
catalog the server loaded does travel, as the `messages` prop; the instance's
composition does not — there is no wire format for a compiled `MessageCompiler`
or a queued plugin to travel across. The client host has `compiler: icuCompiler` and the CDN loader
ONLY because the exact same `createNextI18n({ … }).use(cdnLoader({ … }))`
expression in `config.ts` runs a second time, in the browser, producing an
equivalent host from equivalent source. If a project instead built a
client-only config with different options — or omitted `.use(cdnLoader(…))`
from one side — the two hosts would silently diverge: same `i18n.ts` file,
imported by both runtimes, is what keeps `compiler` and the loader identical,
not any runtime hand-off. `test-apps/next/src/i18n/config.ts` and
`src/i18n/index.ts` in this repository follow exactly this shape — one shared
config module, one `"server-only"` file that calls `setI18n`, one `"use
client"` wrapper that imports the config module a second time.

## Rendering behaviour

**Routing components now use `useLocale()`.** `<Link>`, `usePathname()`, and `useLocalizedRouter()` internally switched to the `useLocale()` hook in v0.3 and still use it. Nothing changes for consumers; routing works identically. Internally it means locale-aware routing skips re-renders on namespace loads and loading-state changes (a measured P1 performance improvement).

**Render-time mutation removed.** The internal `i18n.locale` assignment and `i18n.addTranslations()` calls that used to happen in `<I18nProvider>`'s render body have moved into a `useState` initializer. The server render never writes the shared host's locale; the client applies it before its first commit. The API did not change: `<I18nProvider>` props work identically, and the request locale still reaches every hook and `<T>` through the provider.

**`fallback` is a post-hydration gate here.** `<I18nProvider>` forwards react's `fallback`, and it passes `ssrInitialIsInitializing={false}` on your behalf: the server render already has the catalog (`getI18n()` / `loadTranslations()`), so it is never gated, and neither is the hydration render that reads the same snapshot. A `fallback` in a next app therefore covers only what the CLIENT host still has to initialize after hydration.

**The server request contract.** Your i18n instance lives at module scope and is shared by every concurrent request in a server process. It contributes the translation **catalog** and the **loader**; the locale belongs to the request. Every lookup `getI18n()` hands you names the request locale explicitly, so two concurrent renders at different locales cannot race, and the internal server host type carries no `t`, so a server helper that tried to translate without a locale would not compile. A request that cannot determine its locale throws before it triggers the host's one-time initialization.

Two writes still travel from a request to the shared instance, and the package's tests pin that no request writes the instance's locale or its active namespaces. `addTranslations()` runs on the server: it is additive and keyed by `locale:namespace`, so a concurrent request can only write what the other would have loaded anyway (a first add for a given key does emit `namespaceLoaded`). And `init()` loads the default namespace once, at the instance's own configured locale, never at a request's. Validation of `routing.locales` also still runs on the server, so a bad `[locale]` segment reaches your `onError` in the server logs.

## Error Boundaries

Wrap the client provider in an Error Boundary to handle initialization failures:

```tsx title="src/i18n/ComviProvider.tsx"
// src/i18n/ComviProvider.tsx
"use client";

import React from "react";
import { I18nProvider, type MessagesMap } from "@comvi/next/client";
import { i18n, routing } from "./config";

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
// A `defineRouting` module, not the one that calls `createNextI18n` — see the
// Edge-bundle note in Quick start.
import { routing } from "@/i18n/routing";

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
  const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
    useI18nLoader();
  const { onMissingKey } = useI18nPlugins();
  // …
}
```

The rest of react's surface is here under its own names too, `useI18nHost()`
among them — the bare `WrapperI18nHost` the nearest `<I18nProvider>` holds, for
an imperative call off the render path, and the same name `@comvi/react`,
`@comvi/solid` and `@comvi/svelte` publish. Nothing sends you back to
`@comvi/react` for a hook.

There is no next-specific hook API. Migrating from 0.4.x:
`pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`, or the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## `createNextI18n`: the one recommended way to get a host

`createNextI18n(options)`, from `@comvi/next`, is the recommendation: it builds
the COMPOSED host, the routing config, and the `.use(installer)` pipe in one
call. Reach for it first, and reach for it again when in doubt — the two
quickstarts above are both built on it.

**If a host is built somewhere else**, hand it to the server-only companion
factory instead of building a second one: see
[Host built elsewhere: `createNextI18nFromHost`](#host-built-elsewhere-createnexti18nfromhost)
below.

`createI18n` also stays exported from `@comvi/next/client` and
`@comvi/next/server` — the base host constructor, unchanged since 0.4 — but it
is not a second peer option for a new app to weigh against `createNextI18n`.
It exists for the host factory `createNextI18nFromHost` takes, and for 0.4
callers who already have `createI18n(...)` calls to migrate: see
[`createI18n` on the client and server entries](#createi18n-on-the-client-and-server-entries)
below. The full export list, with `createI18n` alongside it, is in
[One package: all three `@comvi/next` entries](#one-package-all-three-comvinext-entries).

### `createNextI18n` — the composed root

Since core converged to a single BASE entry, `createNextI18n` no longer inherits
a composed core. It **composes one explicitly**, inside this package, so its
published behaviour is preserved exactly: ICU, ambient tag syntax, the loader
(with BOTH `registerLoader` overloads, a loader function and a static import
map), the plugin host, default params and devtools discovery, in that order.
Nested constructor catalogs are not on that list because they never needed to
be: every host flattens them.

ICU is the `compiler` option, and here it **defaults to `icuCompiler`** — the
0.5 promise is that the composed root keeps its published ICU behaviour, so
plural, select and selectordinal compile in every catalog it ingests, whatever
the source. Pass your own `MessageCompiler` to opt out (`compiler: undefined`
is not an opt-out: the default still applies). `createI18n` on
`@comvi/next/client` and `@comvi/next/server` has the opposite default: the base
host, carrying nothing you did not compose, ICU included.

The host type is published as `NextComposedI18n<D>`, which is exactly
`CreateNextI18nResult<D>["i18n"]`:

```ts
import type { NextComposedI18n } from "@comvi/next";

function withHost(i18n: NextComposedI18n) {
  i18n.registerLoader(async (locale) => import(`./locales/${locale}.json`));
  i18n.registerLoader({ en: () => import("./locales/en.json") }); // both overloads
}
```

`packages/next/tests/composed-contract.test.ts` pins every capability a 0.4
caller could reach through `result.i18n`.

### Composing onto the result: `.use(installer)`

The result is `{ i18n, routing, use }`, and `use` is the same composition verb
every host has: `result.use(f)` is `f(result.i18n)`, and it hands back the same
result with `i18n` retyped to whatever the installer widened the host to, so a
chain reads top to bottom and destructures at the end:

```ts
import { createNextI18n, definePlugin, loader, nextPlugin, nextPluginLazy } from "@comvi/next";
import { LocaleDetector } from "@comvi/plugin-locale-detector";
import { routing } from "./routing";

export const { i18n } = createNextI18n({ ...routing, fallbackLocale: "en" })
  .use(loader({ en: () => import("./locales/en.json"), uk: () => import("./locales/uk.json") }))
  .use(nextPlugin(LocaleDetector({ order: ["cookie", "navigator"] }), { runtime: "client" }))
  .use(
    nextPluginLazy(
      () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
      { runtime: "client", environment: "development", required: false },
    ),
  )
  .use(definePlugin((i18n) => i18n.on("localeChanged", () => {}))); // your own plugin
```

Runtime and environment scoping live on the PLUGIN form, in two Next-specific
installers exported from the root, `/client` and `/server`:

| installer                        | what it registers                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nextPlugin(plugin, options?)`   | `plugin`, run at `init()` only where `runtime` (`"client"` / `"server"`, omit for both) and `environment` (`"all"` / `"development"` / `"production"`) say |
| `nextPluginLazy(load, options?)` | the plugin `load()` resolves to (`() => Promise<plugin \| { default: plugin }>`), imported at most once and only where the scope says                      |

`options` also takes every plugin option (`required`, `timeout`, `onError`),
forwarded to `registerPlugin`. Both attach the plugin host if the chain has not
already, exactly like `definePlugin(fn)` — which is what an UNscoped plugin of
your own goes through — and a plugin package goes straight in through its
lowercase installer (`fetchLoader(…)`, never `FetchLoader(…)`). A plugin scoped
out of the current runtime is still imported; `nextPluginLazy` is the form that
defers the import too.

**Never compose `localeDetector()` on this host.** It lives at module scope and
is process-wide on the App Router, so the detector would run once, at the
host's `init()`, and the first request's headers would pin the locale for every
later render. `nextPlugin(LocaleDetector(…), { runtime: "client" })` is the
form: the browser has exactly one visitor, and the server's locale is the
request's (`getI18n()` passes it explicitly).

An installer widens the host IN PLACE and returns it, and everything else in
the result — `setI18n(i18n)`, the provider, the server helpers — holds that one
host. So an installer that hands back a different object is refused with
`code: "E_USE_HOST_IDENTITY"`, reported over `result.i18n` (the composed host),
and a raw plugin handed to `use` — an async one included, whose rejection is
swallowed so the identity error is the only report — gets the same error with
the ways out in its development message. TypeScript catches all three misuses
(an async installer, one that returns nothing, one that returns a copy) before
runtime.

**Upgrading from 0.4.x:** `use(plugin, options)` was Next's own scoped
raw-plugin queue and is gone, and the four delegates `useClient`, `useServer`,
`useClientLazy` and `useServerLazy` are **deleted**, not deprecated. Run
`pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`; the rename table it
applies:

| 0.4                                               | 0.5                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `.use(Plugin())`                                  | `.use(nextPlugin(Plugin()))` (`definePlugin` is equivalent)      |
| `.use(FetchLoader(o))`                            | `.use(fetchLoader(o))`                                           |
| `.use(Plugin(), { runtime, environment, …opts })` | `.use(nextPlugin(Plugin(), { runtime, environment, …opts }))`    |
| `.use(load, { lazy: true, …opts })`               | `.use(nextPluginLazy(load, { …opts }))`                          |
| `.useClient(p, o)` / `.useServer(p, o)`           | `.use(nextPlugin(p, { …o, runtime: "client" \| "server" }))`     |
| `.useClientLazy(l, o)` / `.useServerLazy(l, o)`   | `.use(nextPluginLazy(l, { …o, runtime: "client" \| "server" }))` |
| `nextI18n.i18n.registerLoader(map)`               | `.use(loader(map))` (the overload still works)                   |

### `createI18n` on the client and server entries

Not a peer of `createNextI18n` above — this is the direct base-host
constructor `@comvi/next/client` and `@comvi/next/server` both re-export from
`@comvi/core`, for the host factory `createNextI18nFromHost` takes and for 0.4
callers migrating a direct `createI18n(...)` call.

**Upgrading from 0.4.x? Read this.** `createI18n` from `@comvi/next/client` is
the name 0.4 published, and it now builds the BASE host. ICU, tag syntax, the
loader, the plugin host and devtools discovery became things you compose:

| 0.4 behaviour of `createI18n`                         | after                   | loudness                                                             | migration                                                              |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| ICU plurals, select, selectordinal                    | not compiled by default | **dev throws; prod renders it literally and reports** `E_ICU_SYNTAX` | see the two ICU shapes below                                           |
| loader (`registerLoader`, `reloadTranslations`, …)    | absent until composed   | the loud capability error, at `useI18nLoader()`                      | `.use(loader(map))` / `.use(attachLoader)`                             |
| `.use(plugin)`, `onMissingKey`                        | absent until composed   | TS error + runtime `TypeError`                                       | `.use(definePlugin(p))`, or `.use(plugins())` then `registerPlugin(p)` |
| devtools discovery (`instanceId`, `window.__COMVI__`) | absent                  | invisible to the browser extension (documented)                      | `.use(devtools({ instanceId }))`                                       |
| tag markup through `t()` (`"<b>hi</b>"`)              | literal text            | dev warning; prod literal, never a throw                             | render `<T>`, or `import "@comvi/core/tags"`                           |
| `<I18nProvider>`, every hook, `<T>`, routing          | untouched               | —                                                                    | —                                                                      |

Staying on the 0.4 semantics with no composition work at all is one line:
`createNextI18n` above is that recipe, preserved.

If your tree was built against 0.5 development, the second constructor name that
briefly sat beside `createI18n` on these two entries for the bare host is
deleted. It never published, so there is no deprecation debt. Run
`pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`, which renames it, and
see the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md)
for the rename table.

### ICU is one option, on both entries

`compiler: icuCompiler` is a constructor field held for the instance's life, so
it covers **any** catalog: inline, hydrated later, or fetched by an SSR loader.
`icuCompiler` is exported from both `@comvi/next` entries:

```tsx
// INLINE — the constructor ingests the catalog.
import { createI18n, icuCompiler } from "@comvi/next/client";

const translation = { en: { items: "{count, plural, one {# item} other {# items}}" } };

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });
```

```tsx
// LATER — a hydrated client catalog, or anything an SSR loader fetches:
// the same option, in the same place.
import { createI18n, icuCompiler, loader } from "@comvi/next/server";

const host = createI18n({ locale: "en", compiler: icuCompiler }).use(
  loader({ uk: () => import("./uk.json") }),
);
```

A client host is hydrated rather than loaded: nothing is ingested at
construction, and the catalog arrives through `<I18nProvider messages>`. The
option covers that catalog too.

## Host built elsewhere: `createNextI18nFromHost`

The "host built elsewhere" option: when you want the server to pay only for
what it uses, build the host yourself and hand it to the companion factory,
exported from **`@comvi/next/server`** and nowhere else:

```ts
// i18n/index.ts — a separate, self-contained example, not the quickstart app:
// its own locale list, its own catalog. In an app, spread the `defineRouting`
// object here exactly as `createNextI18n` does above.
import "server-only";
import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () =>
    createI18n({ locale: "en", defaultNs: "default" }).use(
      loader({ uk: () => import("./uk.json") }),
    ),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

`.use(installer)` is core's composition pipe: `host.use(f)` is `f(host)`.
`loader(map)` attaches the capability **and** registers the map. For a
plain `LoaderFn`, compose `.use(attachLoader)` and call `registerLoader(fn)`
yourself; that keeps the import-map adapter out of the server bundle (it is
+111 B min+gz on this graph), which is the form the size fixture measures.

The server **always** needs the loader
(`NextServerHost = WrapperI18nHost & I18nLoaderApi`), while ICU and tag
interpolation enter the graph only if your factory composes them. Options are
routing-only; locale, namespaces, translations, tags, plugins and the API key
belong to the host factory and do not exist on the options type. The result is
exactly `{ i18n, routing }` — no `.use` pipe, composition belongs in the factory
— with your host type preserved.

Construction is **eager**: `host()` runs exactly once, inside the call, and the
instance it returns is both `result.i18n` and what `getI18n()` /
`loadTranslations()` resolve. The documented shape is a module-scope
`export const { i18n, routing } = …`, which is exactly when a module-scope host
should be built — the same moment `createNextI18n` builds its own. A factory
that throws configures nothing, so the module can be fixed and re-run.

**Configure the server i18n once per process.** A second `setI18n(other)` used
to overwrite the first silently; it now throws, in development and production,
naming both sources. A same-instance `setI18n()` stays a no-op.

The client recipe is a base host hydrated from the catalog the server
serialized. Whole-app comvi graph, min+gz, `next` and `react` externalized
(`pnpm size`, rows in `scripts/size-budgets.json`, each gated at measured + 5 %):

| graph                                                            | min+gz   | row                             |
| ---------------------------------------------------------------- | -------- | ------------------------------- |
| server, `createNextI18nFromHost` on a composed base host         | **7240** | `fw-next-server-default-loader` |
| client, base host hydrated                                       | **7331** | `fw-next-client-default`        |
| the recommended path: `createNextI18n` + `loader` + `nextPlugin` | **9450** | `fw-next-root-composed`         |

A fully composed 0.4-style client (ICU + loader + plugins + devtools + `<T>`)
is the migration CEILING rather than a parity claim. 0.4 also registered
string-API tag syntax ambiently, and that is now an explicit `@comvi/core/tags`
import which neither next entry re-exports.

## One package: all three `@comvi/next` entries

`@comvi/next/client` and `@comvi/next/server` each carry the base host
constructor and the identical capability toolkit, and the root `@comvi/next`
carries the toolkit beside `createNextI18n`, so a next app never names
`@comvi/core`:

| export                         | what it is                                                             |
| ------------------------------ | ---------------------------------------------------------------------- |
| `createI18n`                   | core's base host constructor, the same binding on both runtime entries |
| `icuCompiler`                  | the ICU compiler, from core's pure `/icu` subpath                      |
| `loader`, `attachLoader`       | from core's pure `/loader` subpath                                     |
| `plugins`, `definePlugin`      | from core's pure `/plugins` subpath                                    |
| `devtools`                     | from core's pure `/devtools` subpath                                   |
| `nextPlugin`, `nextPluginLazy` | this package's runtime-scoped plugin installers                        |

`DevtoolsOptions` and `NextPluginOptions` come with them as types. The server
entry carries the toolkit because `NextServerHost = WrapperI18nHost &
I18nLoaderApi` makes the loader **mandatory** for SSR. The one host an app cannot
avoid composing should not require a second package to compose. The root carries
it because a shared `i18n/config.ts` is imported by both runtimes and can name
neither runtime entry.

These are **named** re-exports of core's own bindings, from core's pure
subpaths only, never through `@comvi/react`, because webpack development
reconnects a single `export … from` across one `sideEffects: false` package but
not a two-package chain. The ones you do not call are pruned: the
`next-client-default`, `next-client-icu` and `next-server-on-default` matrix
cases assert that every capability subpath an app did not reach for stays out of
its module graph, in webpack and vite, development and production.

Neither entry re-exports `@comvi/core/tags`, the one side-effectful subpath:
importing it registers string-API tag syntax ambiently, and that stays your
app's explicit call. `next-server-on-default` asserts those tag chunks never
reach a server graph at all.

`plugins()` and `devtools(options)` are the configured installers for their
capabilities; the low-level `attachPlugins` / `attachDevtools` pair is not
re-exported from any next entry — import it from `@comvi/core/plugins` /
`@comvi/core/devtools` directly if you need it.

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

## ICU MessageFormat

ICU MessageFormat handles plurals, ordinals, and select with locale-correct grammar via `Intl.PluralRules`. Comvi i18n inherits the full ICU runtime from the underlying binding.

```tsx
import { useI18n } from "@comvi/next/client";

function Stats() {
  const { t } = useI18n();
  return <p>{t("items", { count: 5 })}</p>;
}
```

See the [@comvi/react ICU section](../react#icu-messageformat) for the full multilingual examples, ordinals, and select.

## Type-safe translation keys

Extend the `TranslationKeys` interface via declaration merging for autocomplete and parameter validation. Type definitions can be generated automatically from the Comvi Platform via `@comvi/cli` or from local JSON files via `@comvi/vite-plugin`.

```typescript check=group=typed-keys
// src/types/i18n.d.ts
import "@comvi/core"; // resolves the module before augmenting it

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: never;
    help: never;
    items: { count: number };
    "errors:NOT_FOUND": never;
  }
}
```

```tsx check=group=typed-keys
import { useI18n } from "@comvi/next/client";

export function Welcome() {
  const { t } = useI18n();

  // ✓ Autocomplete, params required
  const msg = t("welcome", { name: "Alice" });

  return <h1>{msg}</h1>;
}
```

**What TypeScript catches:**

```ts check=group=typed-keys check=expect-error=TS2345
import { useI18n } from "@comvi/next/client";
const { t } = useI18n();

// ✗ TS2345 — Argument of type '"welcome"' is not assignable to parameter of type
//   'never'. `welcome` declares a required param, so the key-only overload is out.
t("welcome");
```

```ts check=group=typed-keys check=expect-error=TS2769
import { useI18n } from "@comvi/next/client";
const { t } = useI18n();

// ✗ TS2769 (no overload matches) — Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ TS2769 (no overload matches) — Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ TS2769 (no overload matches) — '"typo"' is not a declared key
t("typo", { name: "Alice" });
```

For CDN-delivered translations and visual in-context editing, pair with the [Comvi Platform](https://comvi.io) via [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) and [`@comvi/plugin-in-context-editor`](../plugin-in-context-editor).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
