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

`@comvi/next` translates Server Components with an i18n instance per request and hands what they
rendered to Client Components as data: same first paint, no catalog fetched. App Router only.

## Install

```bash
npm install @comvi/next @comvi/react @comvi/core
# Peers: next ^15.5.28 || ^16.4.3, react ^19.3.1
```

## Setup

The locales, in `src/i18n/routing.ts` (plain data: the middleware imports it too):

```ts title="src/i18n/routing.ts" check=group=next-1
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({ locales: ["en", "uk"], defaultLocale: "en" });
```

The one place for the settings, in `src/i18n/server.ts` (server only: the entry imports `server-only`):

```ts title="src/i18n/server.ts" check=group=next-1
import { createGetI18n } from "@comvi/next/server";
import { routing } from "./routing";

export const getI18n = createGetI18n({
  ...routing,
  fallbackLocale: "en",
  timeZone: "UTC",
  loader: async (locale, ns) =>
    (await import(`../locales/${ns === "default" ? locale : `${ns}/${locale}`}.json`)).default,
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

`getI18n({ locale })` checks the locale against `locales` (else `notFound()`), reads no request API
(a static page stays static) and returns this request's instance, its catalogs loaded once per
request. The server `<I18nProvider>` hands the browser data only: `handover(i18n)` (catalogs, a
failed one as `null`, locale, time zone, clock) and the instance's `fallbackLocale`, `formats` and
current `defaultParams`. `defaultParams` in the server configuration and in the client `options`
hold strings, finite numbers, booleans and `null` only: anything else (a tag handler, a `Date`,
an array) is a type error and a `TypeError` naming the key. A tag handler goes with the
translation: its params (`t("terms", { link })`) or `components` of `<T>`, on the server and in
the browser alike (below). Each payload's set replaces the browser's whole set: a later payload
(`router.refresh()`) that changes or drops a param changes or clears it at once, overwriting a
`setDefaultParams()` made in the browser; a rerender with the same payload changes nothing, and a
set equal to the browser's current one publishes nothing. The loader, callbacks and other options stay on the server.

## Use in components

A Server Component asks for the namespaces it needs (`t` reads the first; without `ns`, `default`);
a page that needs more than its layout hands its own payload over, in `src/app/[locale]/account/page.tsx`:

```tsx title="src/app/[locale]/account/page.tsx" check=group=next-1
import { I18nProvider } from "@comvi/next/server";
import { getI18n } from "@/i18n/server";
import { Profile } from "./Profile";

export default async function Account({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t, i18n } = await getI18n({ locale, ns: "account" });
  return (
    <I18nProvider i18n={i18n}>
      <h1>{t("title")}</h1>
      <p>{t("terms", { link: (text) => <a href="/terms">{text}</a> })}</p>
      <Profile />
    </I18nProvider>
  );
}
```

A Client Component reads through `@comvi/react` (`useI18n(ns)`, `<T>`, `useLocale()`,
`useFormat()` from `@comvi/react/format`), in `src/app/[locale]/account/Profile.tsx`:

```tsx title="src/app/[locale]/account/Profile.tsx" check=group=next-1
"use client";
import { T, useI18n } from "@comvi/react";

export function Profile() {
  const { t } = useI18n("account");
  return (
    <>
      <p>{t("greeting", { name: "Ada" })}</p>
      <T ns="account" i18nKey="terms" components={{ link: "strong" }} />
    </>
  );
}
```

The browser loads nothing; a catalog the server failed to load renders its fallback on both sides,
and `router.refresh()` renders the route again. For a browser `loader`, pass `client={Mine}`: a
`"use client"` component that renders `<I18nProvider>` of `@comvi/next/client` with
`{ ...props.options, loader }`; it loads only what no payload brought, `i18n.load(ns)` retries.
A later payload of the same provider (`router.refresh()`) means what the first one meant, a failed
catalog included: the server's fallback renders, client state is kept, nothing remounts.

## Locale routing

The URL is the locale: switch by navigating (`<Link locale="uk">`, `useLocalizedRouter()` from
`@comvi/next/navigation`), not with `setLocale()`. The middleware (`proxy.ts` and
`@comvi/next/proxy` on Next.js 16) redirects to the locale prefix and remembers it in a cookie:

```ts title="src/middleware.ts"
import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing); // getI18n() without `locale` reads the locale it sets
```

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
