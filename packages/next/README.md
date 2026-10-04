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

```ts title="next.config.ts" check=group=quick-start-next-1
import { withComvi } from "@comvi/next/plugin";

export default withComvi({ config: "./src/i18n/config.ts" })({});
```

```ts title="src/i18n/routing.ts" check=group=quick-start-next-1
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({ locales: ["en", "uk"], defaultLocale: "en" });
```

```ts title="src/i18n/config.ts" check=group=quick-start-next-1
import { createNextI18n } from "@comvi/next";
import { routing } from "./routing";

export const { i18n } = createNextI18n({
  ...routing,
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

export { routing };
```

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

`createNextI18n` builds the host, and `withComvi` points the library at the module that exports
it. The server helpers and `<ComviProvider>` read the host from there, so you write no
registration module and no `"use client"` wrapper. `<ComviProvider>` loads the locale's
catalogs on the server and hands them to the client host, so Client Components render the right
language on the first paint. `@comvi/next/server` guards itself: a Client Component that imports
it fails `next build`. Without a `middleware.ts` the only routes are `/en` and `/uk`; see
[Locale routing](https://comvi.io/docs/i18n/next/routing).

## Use in components

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

```ts title="src/i18n/config.ts" check=group=next-2
import { createNextI18n } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import { routing } from "./routing";

export const { i18n } = createNextI18n({ ...routing }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }),
);

export { routing };
```

Replace the inline catalog with the loader; every other file stays as it is. `<ComviProvider>`
fetches the locale on the server and seeds the client with it, so the first paint never races the
CDN. The CDN URL is on [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If
your keys use ICU (`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent, and either works without the other.

## Specific to Next.js

Seven entries: `@comvi/next`, `/client`, `/server`, `/navigation`, `/routing`, `/middleware` and
`/plugin`. `/routing` and `/middleware` carry no host, and `/plugin` runs only in next.config.
`src/i18n/config.ts` is bundled into the server build and into the client build, and each build
evaluates it once, so it must be client-safe. A loader that needs server-only code stays on the
manual setup: `createNextI18nFromHost` in a server-only module and your own `"use client"` wrapper
around `<I18nProvider>`. Never compose a locale detector on this host: the config module is
process-wide on the server, so the first request's headers would pin the locale for everyone.
Scope it to the client with `nextPlugin(localeDetectorPlugin(…), { runtime: 'client' })`; see
[Plugin scoping](https://comvi.io/docs/i18n/next/server-client#plugin-scoping).

## Next steps

- [Next.js guide](https://comvi.io/docs/i18n/next): `withComvi`, `<ComviProvider>`, `loadTranslations()`, two runtimes, errors.
- [Locale routing](https://comvi.io/docs/i18n/next/routing): `defineRouting`, the middleware and localized links.
- [Next.js API reference](https://comvi.io/docs/i18n/api/next): every export of the six entries.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
