<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/next</h1>

<p align="center">Next.js App Router bindings for Comvi i18n: server helpers, client hooks, middleware.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/next"><img src="https://img.shields.io/npm/v/@comvi/next?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/next"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

`@comvi/next` is the Comvi i18n binding for the Next.js App Router: one config module, a
next.config plugin that points the library at it, and `t()` in Server and Client Components alike.
It replaces `@comvi/react` on Next.js and brings `@comvi/core` and the React bindings with it.

## Install

```bash
npm install @comvi/next
# Peers: next ^15 || ^16, react ^18.2 || ^19
```

## Setup

Point Next at the config module, in `next.config.ts`:

```ts title="next.config.ts" check=group=quick-start-next-1
import { withComvi } from "@comvi/next/plugin";

export default withComvi({ config: "./src/i18n/config.ts" })({});
```

Declare the locales, in `src/i18n/routing.ts`:

```ts title="src/i18n/routing.ts" check=group=quick-start-next-1
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({ locales: ["en", "uk"], defaultLocale: "en" });
```

Build the i18n instance, in `src/i18n/config.ts`:

```ts title="src/i18n/config.ts" check=group=quick-start-next-1
import { createNextI18n } from "@comvi/next";
import { routing } from "./routing";

export const { i18n } = createNextI18n({
  ...routing,
  messages: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

export { routing };
```

Wrap the tree, in `src/app/[locale]/layout.tsx`:

```tsx title="src/app/[locale]/layout.tsx" check=group=quick-start-next-1
import { notFound } from "next/navigation";
import { hasLocale } from "@comvi/next/routing";
import { ComviProvider } from "@comvi/next/server";
import { routing } from "@/i18n/routing";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale}>
      <body>
        <ComviProvider locale={locale}>{children}</ComviProvider>
      </body>
    </html>
  );
}
```

`createNextI18n` builds the i18n instance, and `withComvi` points the library at the module that
exports it; it wraps an object or a function config, and a relative `config` path resolves
against the directory you run `next` in. The server helpers and `<ComviProvider>` read the i18n
instance from there, so you write no registration module and no `"use client"` wrapper.
`<ComviProvider>` loads the locale's catalogs on the server and hands them to the client's i18n
instance, so Client Components render the right language on the first paint. Without a `proxy.ts`
(Next.js 16) or `middleware.ts` (Next.js 15) the only routes are `/en` and `/uk`; see
[Locale routing](https://comvi.io/docs/i18n/guides/next-routing).

## Use in components

Call `t()` in a Server Component, in `src/app/[locale]/page.tsx`:

```tsx title="src/app/[locale]/page.tsx" check=group=quick-start-next-1
import Link from "next/link";
import { getI18n } from "@comvi/next/server";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await getI18n({ locale });

  return (
    <div>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <Link href={locale === "en" ? "/uk" : "/en"}>Switch</Link>
    </div>
  );
}
```

In a Server Component `getI18n({ locale })` returns `t`, `hasTranslation` and `locale`, bound to
the locale you pass. Pass it explicitly: Next can render the page before the layout. In a Client
Component `useI18n()`, `<T>` and the other React hooks come from `@comvi/next/client`, under
`<ComviProvider>`. `formatNumber`, `formatDate`, `formatCurrency` and `formatRelativeTime` are on
all three entries and take the instance first: `formatRelativeTime(i18n, -2, 'hour')`.

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

Compose the loader in `src/i18n/config.ts`:

```ts title="src/i18n/config.ts" check=group=next-2
import { createNextI18n } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { routing } from "./routing";

export const { i18n } = createNextI18n({ ...routing }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }),
);

export { routing };
```

The inline catalog goes; every other file stays as it is. `<ComviProvider>` fetches the locale on
the server and seeds the client with it, so the first paint never races the CDN. The CDN URL is on
[Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If your keys use ICU
(`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent.

### How it works

`withComvi` aliases the internal specifier `@comvi/next/config` to your config module, so
`@comvi/next/server` (`getI18n`, `<ComviProvider>`, `loadMessages`) and `@comvi/next/client`
(`useI18n`, `<T>`, the other React hooks) find the same i18n instance without you passing it
around. The module is bundled into the server build and into the client build, so it must be
client-safe; `@comvi/next/server` imports `server-only`, so a Client Component that imports it
fails `next build`. The other entries are `/routing` (`defineRouting`, `hasLocale`), `/navigation`
(localized `<Link>` and router), `/proxy` and `/middleware` (the request handler) and `/plugin`
(`withComvi`).

Never compose a locale detector on this i18n instance: the config module is process-wide on the
server, so the first request's headers would pin the locale for everyone. Scope it to the client
with `nextPlugin(localeDetectorPlugin(…), { runtime: 'client' })`; see
[Plugin scoping](https://comvi.io/docs/i18n/guides/next-server-client#plugin-scoping). To make
the app visible to the Comvi browser extension, add `.use(devtools())` to the `createNextI18n`
result, with `devtools` imported from `@comvi/next`; on the server it does nothing.

## Routing

Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts`, with the same handler. Import
`createMiddleware` from `@comvi/next/proxy` there and export it as the default (or as `proxy`):

```ts title="src/proxy.ts"
import { createMiddleware } from "@comvi/next/proxy";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

On Next.js 15, name the file `middleware.ts` and import from `@comvi/next/middleware`; the two
subpaths export the same function.

The handler redirects to the locale prefix `defineRouting` describes (`localePrefix` is
`as-needed` by default) and remembers the choice in a cookie. `localeCookie` is a routing option:
a name, `{ name, maxAge, secure, sameSite, domain }`, or `false` to persist nothing (default
`NEXT_LOCALE`). `localeDetection` is an option of `createMiddleware` itself, passed next to the
routing config: `{ order, queryParam, headerName, resolveAcceptLanguage }`, or `false` to leave
the URL path alone in charge. A client-side switch through `<Link locale>` or the router from
`@comvi/next/navigation` writes the cookie too, with the name and attributes of the `routing`
export of your config module; that is why `src/i18n/config.ts` re-exports `routing`. Without that
export the switch writes the default `NEXT_LOCALE` cookie, whatever the middleware was told.

A loader that needs server-only code cannot live in the client-safe config module. Build that
i18n instance with `createNextI18nFromInstance` from `@comvi/next/server`, or hand one over with
`setI18n(i18n)` from the same entry, and wrap `<I18nProvider>` in your own `"use client"` component.

## Read next

- [Next.js guide](https://comvi.io/docs/i18n/next): `withComvi`, `<ComviProvider>`, `loadMessages()`, two runtimes, errors.
- [Next.js API reference](https://comvi.io/docs/i18n/api/next): every export of every entry.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
