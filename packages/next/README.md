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
  <a href="https://bundlejs.com/?q=%40comvi%2Fnext"><img src="https://deno.bundlejs.com/?q=@comvi/next&badge=&badge-style=flat&badge-raster" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/next` builds on [`@comvi/react`](../react) with SSR utilities and locale routing for the Next.js App Router. `createNextI18n()` handles i18n setup plus routing config; server-only functions load translations on the server side; client-only entries provide the React provider and locale-aware navigation.

Designed for Next.js 14+ / 15+ with React 18+ / 19+.

📖 **Documentation:** https://comvi.io/docs/i18n/next/

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~8 kB gzipped, zero runtime dependencies.** No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`. You only ship what you use.
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

## Rich text with `<T>`

The `<T>` component is inherited from [`@comvi/react`](../react). Embed components in translation strings without raw HTML or unsafe DOM injection.

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
