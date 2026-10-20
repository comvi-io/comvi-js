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
  <a href="https://bundlephobia.com/package/@comvi/next"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/next?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/next"><img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz"></a>
</p>

---

Translate a Next.js App Router app with `@comvi/next`: one config module, a next.config plugin
that points the library at it, and `t()` in Server and Client Components alike. One install
brings `@comvi/core` and the React bindings. The full guide is
[Next.js](https://comvi.io/docs/i18n/next) on the docs site.

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
exports it. A relative `config` path resolves against the directory you run `next` in, so run it
from the app directory or pass an absolute path. `withComvi` loads from `next.config.ts`, `.mjs` and `.js` alike, and it wraps an
object or a function config. The server helpers and `<ComviProvider>` read the i18n instance from there, so you write no
registration module and no `"use client"` wrapper. `<ComviProvider>` loads the locale's
catalogs on the server and hands them to the client's i18n instance, so Client Components render the right
language on the first paint. `@comvi/next/server` guards itself: a Client Component that imports
it fails `next build`. Without a `proxy.ts` (Next.js 16) or `middleware.ts` (Next.js 15) the only routes are `/en` and `/uk`; see
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
`<ComviProvider>`.

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

## Specific to Next.js

Eight public entries: `@comvi/next`, `/client`, `/server`, `/navigation`, `/routing`, `/proxy`,
`/middleware` and `/plugin`. `/routing`, `/proxy` and `/middleware` carry no i18n instance, and
`/plugin` runs only in next.config. The package exports a ninth, `/config`: that is the specifier
`withComvi` aliases to your own config module, and you never import it yourself.

`src/i18n/config.ts` is bundled into the server build and into the client build, and each build
evaluates it once, so it must be client-safe. Never compose a locale detector on this i18n instance: the config module is
process-wide on the server, so the first request's headers would pin the locale for everyone.
Scope it to the client with `nextPlugin(localeDetectorPlugin(…), { runtime: 'client' })`; see
[Plugin scoping](https://comvi.io/docs/i18n/guides/next-server-client#plugin-scoping).

`createNextI18n` does not publish the i18n instance to the Comvi browser extension. To make the app
visible to it and let it load the in-context editor, add `.use(devtools())` to the result in
`src/i18n/config.ts`, with `devtools` imported from `@comvi/next`. On the server it does nothing.

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
subpaths export the same function. Next 16 runs `proxy.ts` on the Node.js runtime and rejects a
`runtime` option in it; `createMiddleware` works on both runtimes.

`createMiddleware` takes the same two locale options as `@comvi/nuxt`, with the same defaults
except the cookie name. `localeCookie` takes a name, `{ name, maxAge, secure, sameSite, domain }`,
or `false` to persist nothing. Pass the same routing config to `<I18nProvider>` from
`@comvi/next/client`: without it a client-side switch writes the default `NEXT_LOCALE` cookie
with default attributes, whatever this option says. `localeDetection` takes `{ order, queryParam,
headerName, resolveAcceptLanguage }`, or `false` to leave the URL path alone in charge.

### Advanced

A loader that needs server-only code cannot live in the client-safe config module. Build that
i18n instance with `createNextI18nFromInstance` in a server-only module, or hand one over with
`setI18n(i18n)`, and wrap `<I18nProvider>` in your own `"use client"` component.

## Next steps

- [Next.js guide](https://comvi.io/docs/i18n/next): `withComvi`, `<ComviProvider>`, `loadMessages()`, two runtimes, errors.
- [Locale routing](https://comvi.io/docs/i18n/guides/next-routing): `defineRouting`, the middleware and localized links.
- [Next.js API reference](https://comvi.io/docs/i18n/api/next): every export of every entry.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
