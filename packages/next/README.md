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

Translate a Next.js App Router app with `@comvi/next`: one config module, a `server-only`
registration, and `t()` in Server and Client Components alike. One install brings `@comvi/core`
and the React bindings. The full guide is [Next.js](https://comvi.io/docs/i18n/next) on the docs site.

## Install

```bash
npm install @comvi/next server-only
# Peers: next ^15.0.0 || ^16.0.0, react ^18.2.0 || ^19.0.0
```

## Setup

```ts title="src/i18n.ts" check=group=quick-start-next-1
import { createNextI18n } from "@comvi/next";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});
```

```ts title="src/i18n.server.ts" check=group=quick-start-next-1
import "server-only";

import { setI18n } from "@comvi/next/server";
import { i18n } from "./i18n";

setI18n(i18n);
```

```tsx title="src/app/[locale]/layout.tsx" check=group=quick-start-next-1
import { notFound } from "next/navigation";
import { hasLocale } from "@comvi/next/routing";
import { setRequestLocale } from "@comvi/next/server";
import { routing } from "@/i18n";
import "@/i18n.server";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
```

`createNextI18n` builds the host and the routing config. The `server-only` module registers the
host for the server helpers and keeps that file out of the client bundle; the layout imports it for
the side effect. `setRequestLocale()` puts the locale where `getI18n()` reads it. Without a
`middleware.ts` the only routes are `/en` and `/uk`; see
[Locale routing](https://comvi.io/docs/i18n/next/routing).

## Use in components

```tsx title="src/app/[locale]/page.tsx" check=group=quick-start-next-1
import Link from "next/link";
import { getI18n } from "@comvi/next/server";

export default async function HomePage() {
  const { t, locale } = await getI18n();

  return (
    <div>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <Link href={locale === "en" ? "/uk" : "/en"}>Switch</Link>
    </div>
  );
}
```

In a Server Component `getI18n()` returns `t`, `hasTranslation` and `locale`, bound to the
request. In a Client Component `useI18n()`, `<T>` and the other React hooks come from
`@comvi/next/client`, under the `"use client"` provider on the guide's [Setup](https://comvi.io/docs/i18n/next#setup).

## Load from Comvi

```bash
npm install @comvi/plugin-fetch-loader
```

```ts title="src/i18n.ts" check=group=next-2
import { createNextI18n } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project-token>" }));
```

Replace the inline catalog with the loader; every other file stays as it is. `loadTranslations()`
fetches the locale on the server and seeds the client through `messages`, so the first paint never
races the CDN. The CDN URL is on [Connect to Comvi](https://comvi.io/docs/i18n/connect-comvi). If
your keys use ICU (`{count, plural, …}`), add `compiler: icuCompiler` as on
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization); the platform and the compiler are
independent, and either works without the other.

## Specific to Next.js

Six entries: `@comvi/next`, `/client`, `/server`, `/navigation`, `/routing` and `/middleware`;
the last two carry no host. `src/i18n.ts` is bundled into the server build and into the client
build, and each build evaluates it once, so keep one config module and import it from both sides.
Never compose a locale detector on this host: the config module is process-wide on the server, so
the first request's headers would pin the locale for everyone. Scope it to the client with
`nextPlugin(localeDetectorPlugin(…), { runtime: 'client' })`; see
[Plugin scoping](https://comvi.io/docs/i18n/next/server-client#plugin-scoping).

## Next steps

- [Next.js guide](https://comvi.io/docs/i18n/next): the client provider, `loadTranslations()`, two runtimes, errors.
- [Locale routing](https://comvi.io/docs/i18n/next/routing): `defineRouting`, the middleware and localized links.
- [Next.js API reference](https://comvi.io/docs/i18n/api/next): every export of the six entries.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
