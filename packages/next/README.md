<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/next</h1>

<p align="center">Next.js App Router bindings for Comvi i18n: a request-scoped server helper, the server-to-browser handover, locale routing.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/next"><img src="https://img.shields.io/npm/v/@comvi/next?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/next"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/next` is the Next.js App Router binding of Comvi i18n: a server helper with an i18n instance
per request, a provider that hands the server's catalogs to Client Components, and locale routing.
Define the routing, create `getI18n()`, and wrap the layout in `<I18nProvider>`.

## Install

```bash
npm install @comvi/next @comvi/react @comvi/core
# Peers: next ^15.5.29 || ^16.4.5, react ^19.3.1
```

`@comvi/next` asks for `@comvi/react` and `@comvi/core` at exactly its own version: `@comvi/core`
and every binding in an app must be on one version. With two copies of `@comvi/core` (two versions,
or one version installed twice) nothing fails at import: an error that names both versions is thrown
when an instance created by one copy reaches code of the other (a binding, or `@comvi/core/format`).

## Setup

The locales, in `src/i18n/routing.ts` (plain data: the middleware imports it too):

```ts title="src/i18n/routing.ts" check=group=next-1
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({ locales: ["en", "uk"], defaultLocale: "en" });
```

The one place for the settings, in `src/i18n/server.ts` (server only; `timeZone` is required):

```ts title="src/i18n/server.ts" check=group=next-1
import { createGetI18n } from "@comvi/next/server";
import { routing } from "./routing";

export const getI18n = createGetI18n({
  ...routing,
  fallbackLocale: "en",
  timeZone: "UTC",
  loader: async (locale, ns) =>
    (await import(`../locales/${ns === "default" ? locale : `${ns}/${locale}`}.json`)).default,
  onError(error) {
    if (error.code === "load_failed")
      console.error(`No catalog for ${error.locale}/${error.ns}`, error.cause);
  },
});
```

The layout hands the request's catalogs to the browser, in `src/app/[locale]/layout.tsx`:

```tsx title="src/app/[locale]/layout.tsx" check=group=next-1
import { I18nProvider } from "@comvi/next/server";
import { getI18n } from "@/i18n/server";
import { routing } from "@/i18n/routing";

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  const { i18n, dir } = await getI18n({ locale });
  return (
    <html lang={locale} dir={dir}>
      <body>
        <I18nProvider i18n={i18n} routing={routing}>
          {props.children}
        </I18nProvider>
      </body>
    </html>
  );
}
```

`getI18n({ locale })` answers `notFound()` for a locale outside `locales`, reads no request API and
returns this request's i18n instance with its catalogs loaded. The server `<I18nProvider>` hands the
browser data only: the catalogs, the locale, the time zone and the `fallbackLocale` and `formats`
settings. The loader and `onError` stay on the server.

## Use in components

A Server Component calls `const { t } = await getI18n({ locale, ns: "account" })` for the namespaces
it needs; a tag handler goes to `t()` as a param,
`t("terms", { link: (text) => <a href="/terms">{text}</a> })`. A page that needs more namespaces
than its layout wraps its content in its own `<I18nProvider i18n={i18n}>`. A Client Component reads
through `@comvi/react` (`useI18n(ns)`, `<T>`, `useLocale()`, `useFormat()` from
`@comvi/react/format`), and the browser loads nothing: it reads the catalogs the server handed over
([Server and Client Components](https://comvi.io/docs/i18n/guides/next-server-client)).

```tsx title="src/app/[locale]/account/Title.tsx" check=group=next-1
"use client";
import { useRouter } from "next/navigation";
import { useI18n } from "@comvi/react";

export function Title() {
  const { t, isReady } = useI18n("account");
  const router = useRouter();
  if (!isReady) return <button onClick={() => router.refresh()}>Not available. Retry</button>;
  return <h2>{t("title")}</h2>;
}
```

## Report errors with `onError`

`onError` receives every problem as an object with a `code` (`load_failed`, `missing_key` and
others) and the `locale`, `ns` and `key` it concerns. Without it, a development build prints
problems to the console and a production build prints nothing. `onError` reports and changes nothing
else: when a catalog fails, `getI18n()` still resolves and `t()` renders the `fallbackLocale`'s text
or, with no catalog at all, the key. The `onError` of `src/i18n/server.ts` runs on the server; a
browser `onError` or `loader` goes into your own `"use client"` provider, passed as
`<I18nProvider client={…}>`
([Server and Client Components](https://comvi.io/docs/i18n/guides/next-server-client)).

## Retry with `router.refresh()` or `load()`

The browser receives a catalog that failed on the server as failed and does not ask for it:
`useI18n(ns).isReady` is `false` when no catalog of `ns` came with the payload, and `Title` renders
its retry button. `router.refresh()` renders the route again in a new request, which calls the
loader again. `i18n.load(ns)` retries in the browser only when you gave the browser a `loader`.
Server code reads no `i18n.ready`: `getI18n()` waits for the catalogs it needs.

## Typed keys

Typed keys come from JSON catalogs: `src/locales/<locale>.json` is the `default` namespace,
`src/locales/<namespace>/<locale>.json` the others. In `next.config.ts`, pass `types` to
`withComvi()`:
`export default withComvi({ types: { from: "./src/locales", sourceLocale: "en" } })({})`. `next dev`
writes `src/types/i18n.d.ts` and rewrites it when a catalog changes; `next build` writes it once,
before Next type-checks. For `{ "greeting": "Hello, {name}!" }` in `src/locales/en.json` the file
reads, after a header comment:

<!-- prettier-ignore -->
```ts title="src/types/i18n.d.ts" check=group=next-typed
import '@comvi/core';

declare module '@comvi/core' {
  interface Catalogs {
    "default": {
      "greeting": { "name": string | number };
    };
  }
}

export {};
```

From then on, a key that is not in the catalog is a type error, in `t` of `getI18n()` and of
`useI18n()`:

```tsx title="src/app/[locale]/Greeting.tsx" check=group=next-typed check=expect-error=TS2345
"use client";
import { useI18n } from "@comvi/react";

export function Greeting() {
  const { t } = useI18n();
  return <h1>{t("greting", { name: "Alice" })}</h1>; // "greting" is not a key
}
```

A param the message uses is required too. A misspelt namespace is an error in `getI18n({ ns })`,
`useI18n(ns)` and `t(key, { ns })`, and still compiles in `load()`, `add()`, `has()` and the
`namespaces` option ([limit](https://comvi.io/docs/i18n/limitations#namespace-typos-config)).

## Load from Comvi

`cdn()` from `@comvi/core/cdn` is a `loader` that reads the catalogs your Comvi project published to
its CDN.

### `messages` beside `loader`

An inline catalog (`messages`, `catalogs` or `add()`) switches off loading for its own pair of
locale and namespace, and for nothing else: the loader is never asked for that pair, while other
namespaces of that locale and the same namespace in other locales still load. So do not inline a
catalog the CDN should serve. For a bundled catalog that is used when the CDN does not answer, pass
`fallback`: it is a spare, not a base that the CDN's catalog is laid over
([limit](https://comvi.io/docs/i18n/limitations#messages-and-loader)).

```ts check=group=next-1
// In src/i18n/server.ts, the CDN loader in place of the import() one:
import { cdn } from "@comvi/core/cdn";

export const loader = cdn("https://cdn.comvi.io/<project-token>", {
  // keys: "<locale>", or "<locale>:<namespace>"
  fallback: { en: () => import("@/locales/en.json").then((m) => m.default) },
});
```

## Locale routing: navigate, not `setLocale()`

The URL is the locale. Switch by navigating (`<Link locale="uk">` or `useLocalizedRouter()` from
`@comvi/next/navigation`), not with `setLocale()`: a catalog that fails for the new page is a
failed load on the server. The middleware redirects to the locale prefix and remembers the locale in
a cookie (on Next.js 16 the file is `proxy.ts` and the import is `@comvi/next/proxy`):

```ts title="src/middleware.ts" check=group=next-1
import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing); // getI18n() without `locale` reads the locale it sets
```

## SEO: canonical and hreflang

First, the site address, once: `metadataBase` in `src/app/[locale]/layout.tsx`. It is required:
`getAlternates()` returns paths, and without `metadataBase` Next.js leaves them relative, with no
error or warning ([limit](https://comvi.io/docs/i18n/limitations#next-metadatabase)).

```tsx check=group=next-1
import type { Metadata } from "next";

export const metadata: Metadata = { metadataBase: new URL("https://example.com") };
```

Then each page names its path without the locale prefix, in `src/app/[locale]/admin/page.tsx`:

```tsx title="src/app/[locale]/admin/page.tsx" check=group=next-1
import type { Metadata } from "next";
import { getAlternates } from "@comvi/next/routing";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: getAlternates(routing, { locale, href: "/admin" }) };
}
```

`getAlternates()` returns the canonical path in this locale, one hreflang per locale and `x-default`
(the default locale's path); with `localePrefix: "never"`, only `canonical`. With
`localePrefix: "as-needed"`, the default locale's unprefixed URL answers in the default locale to a
client that sends no locale cookie and no `Accept-Language`
([limit](https://comvi.io/docs/i18n/limitations#next-as-needed-default);
[Locale routing](https://comvi.io/docs/i18n/guides/next-routing)).

## Limits

[Limits](https://comvi.io/docs/i18n/limitations) lists what Comvi i18n does not do. Among its
entries:

- [`{count, number}` and `{when, date}` are not message syntax](https://comvi.io/docs/i18n/limitations#no-number-date-args): format the value with `useFormat()` from `@comvi/react/format` and pass the result as a plain param.
- [Text that only a Server Component renders is not editable on the page with the Comvi editor](https://comvi.io/docs/i18n/limitations#editor-server-components).
- [A handed-over catalog replaces the browser's catalog of the same locale and namespace whole](https://comvi.io/docs/i18n/limitations#handover-replaces-slot), and [a payload carries every catalog the server instance holds](https://comvi.io/docs/i18n/limitations#handover-size).
- [After a switch, a namespace inside a hidden `<Activity>` loads when the subtree is shown](https://comvi.io/docs/i18n/limitations#react-activity).

Read next: the [Next.js guide](https://comvi.io/docs/i18n/next) and
[`@comvi/react`](https://www.npmjs.com/package/@comvi/react) for `useI18n()` and `<T>`.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
