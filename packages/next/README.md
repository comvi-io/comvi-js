<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/next</h1>

<p align="center">Next.js App Router bindings for Comvi i18n — server helpers, client hooks, middleware.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/next"><img src="https://img.shields.io/npm/v/@comvi/next?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/next"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/next?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/next` is the whole toolkit for a Next.js App Router app: it bundles `@comvi/core` and the
React bindings, so one install is enough. Server Components get translations server-side, so there
is no flash of untranslated content and no suspense waterfall for i18n. Pair it with the
[Comvi platform](https://comvi.io) and the catalogs are fetched from the CDN at runtime instead of
bundled.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the i18n instance `createNextI18n` returns as `i18n`.

📖 [Documentation](https://comvi.io/docs/i18n/next) · ⚖️ [Comvi vs next-intl](https://comvi.io/compare/next-intl)

## 1. Install

```bash
npm install @comvi/next server-only
# Peers: next ^15 || ^16, react ^18.2 || ^19
```

`server-only` is the guard on the server module below: importing it from a Client Component becomes
a build error instead of a leaked host. It is its own package, so declare it in `dependencies`
rather than relying on a transitive copy.

## 2. Quick start — an inline catalog

Five setup files plus one client component, and each exists for a reason Next imposes. Two of them
are the cost of the App Router's server/client split: Next cannot pass a class instance from a
Server Component to a Client Component, so a `"use client"` wrapper imports the host itself, and a
`"server-only"` module registers it for the server helpers. `src/i18n.ts` therefore runs once per
runtime, and its composition never travels — both builds get it by evaluating the same file
([why this shape](https://comvi.io/docs/i18n/next)). Runnable:
[`examples/next`](../../examples/next).

One call is not optional. The server helpers read the request locale from React's per-request
cache, which either `createMiddleware()` fills or you fill with **`setRequestLocale(locale)`**. This
quickstart has no middleware yet, so call it at the top of **every** layout and page that later
reaches a server helper — the layout's call does not cover the page, because React can start
rendering the page while the layout is still awaiting its own `params`. `getI18n()` throws
`[comvi/next] Locale not set.` if nothing did.

```ts title="src/i18n.ts" check=group=next-quickstart-inline
import { createNextI18n, icuCompiler } from "@comvi/next";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  // Required for the plural below: no constructor in the repo turns ICU on by
  // itself, `createNextI18n` included.
  compiler: icuCompiler,
  translation: {
    en: {
      greeting: "Hello, {name}!",
      items: "{count, plural, one {# item} other {# items}}",
    },
    uk: {
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
import { setRequestLocale } from "@comvi/next/server";
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

  // REQUIRED before any server helper runs. `getI18n()` reads the locale from
  // React's per-request cache, and this is what fills it; without middleware
  // there is nothing else that would.
  setRequestLocale(locale);

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
import { getI18n, setRequestLocale } from "@comvi/next/server";
import { Greeting } from "./Greeting";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  // Not redundant with the layout's call. React can start this subtree while
  // the layout above is still awaiting its own `params`, so the page has to
  // fill the per-request cache for itself; without this line the first load of
  // `/en` is a 500 with `[comvi/next] Locale not set.`
  setRequestLocale(locale);

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

Nothing here calls `loadTranslations()` or passes `messages` to `<I18nProvider>`: the catalog is
inline, so both the server render and the client host already have it at construction. Locale-prefixed
URLs are a `defineRouting` module and a middleware — see
[locale routing](https://comvi.io/docs/i18n/next/routing).

## 3. Connect to Comvi

Step 1's inline `translation` goes away with the loader, so the two keys it put in your own
source — `greeting` and the `items` plural — now have to exist on the platform; [Connect Comvi](https://comvi.io/docs/i18n/connect-comvi)
step 3 creates both.

Three questions, and the first is already answered in step 1.

1. **Which parser?** `compiler: icuCompiler`, unchanged from step 1. The platform's catalogs use
   ICU plurals, and the default `{param}` compiler does not render them. Without `compiler: icuCompiler`, an ICU message
   (`{count, plural, …}`) fails in development at ingestion, before anything renders. Inline, it
   throws `E_ICU_SYNTAX` at the call that carries the catalog; over a loader it fails that
   namespace's load instead — `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and
   `init()` rejects with `[i18n] Failed to load all namespaces …`, not with `E_ICU_SYNTAX`, when
   that was the only namespace. In production it renders the message text literally and reports the
   error through `onError` (`console.error` when no handler is set).
2. **Where from?** `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn` (a second
   install), which fetches the catalog at runtime instead of bundling it.
3. **What to paint meanwhile?** Nothing, on the App Router. **`await loadTranslations(locale)`**
   in the layout hands the result to the provider as `messages`, so the first paint never flashes
   untranslated content and never races the CDN request.

```ts title="src/i18n.ts" check=group=next-quickstart-cdn
import { createNextI18n, icuCompiler } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }));
```

The app files from step 1 change in two places, and nowhere else: the layout awaits
`loadTranslations(locale)` after `setRequestLocale(locale)` and passes the result down, and
`I18nClientProvider` takes a `messages?: MessagesMap` prop to forward to `<I18nProvider>`. The whole
server/client contract — every server helper, the provider's prop table, and plugin scoping — is at
[server and client APIs](https://comvi.io/docs/i18n/next/server-client).

The URL in the snippet above is an example. `cdnUrl` is the whole URL the platform hands you:
open your project and use **Copy URL** on the
**CDN Endpoint** card under **Settings → Content Deploy** (it appears once Content Deploy is
enabled and saved).

## 4. What is specific to Next.js

| subpath                  | what you import from it                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `@comvi/next`            | `createNextI18n`, plus the capability toolkit                                                                         |
| `@comvi/next/client`     | `<I18nProvider>`, every react hook, `<T>`, plus the toolkit                                                           |
| `@comvi/next/server`     | `setI18n`, `setRequestLocale`, `getI18n`, `getLocale`, `loadTranslations`, `createNextI18nFromHost`, plus the toolkit |
| `@comvi/next/navigation` | `<Link>`, `usePathname`, `useLocalizedRouter` — the locale-aware navigation helpers                                   |
| `@comvi/next/routing`    | `defineRouting`, `hasLocale`, `createGetPathname` — server-safe, no host in the graph                                 |
| `@comvi/next/middleware` | `createMiddleware`                                                                                                    |

The first three each carry the identical capability toolkit (`createI18n`, `icuCompiler`, `loader`,
`attachLoader`, `plugins`, `definePlugin`, `devtools`, and this package's `nextPlugin` /
`nextPluginLazy`), so the host and its capabilities come from this package alone. `/routing` and
`/middleware` deliberately carry none of it: they are what `middleware.ts` imports, and an Edge
isolate executes every module its entry reaches. `/navigation` is `"use client"`.

`await getI18n()` returns three members, the same three `@comvi/nuxt`'s `useTranslation(event)`
returns:

| member                       | what it is                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `t(key, params?)`            | a plain string, bound to the resolved locale and to `ns` if you passed one      |
| `hasTranslation(key, opts?)` | whether a key resolves, defaulting to that same locale and namespace            |
| `locale`                     | the locale this call resolved — the string `t` closes over, so it cannot differ |

Read `locale` rather than calling `getLocale()` again: a second read is a second answer.

### Locale routing: what `@comvi/next` and `@comvi/nuxt` share

The two framework modules share their semantics and keep their adapters. Locale routing,
`Accept-Language` matching and the server helper's vocabulary and result shape are one
implementation, so the same request resolves to the same locale in both. Host lifetime, the cookie
name (`NEXT_LOCALE` on Next, `i18n_locale` on Nuxt — each ecosystem's existing one) and how you
install the integration stay framework-shaped.

One behavioural difference remains on purpose. With `localePrefix: "as-needed"`,
`defaultLocale: "en"` and a `de` locale cookie, a request for `/about` is redirected to `/de/about`
on Next, because a next-intl app treats the stored preference as authoritative; Nuxt serves `en` at
`/about` and keeps the cookie, because a nuxt-i18n app treats an unprefixed non-root path as the
default locale's own URL. The plan after 0.5 is one shared option with one name and one meaning,
defaulting per framework to today's behaviour. Full reasoning:
[`docs/design/next-nuxt-parity.md`](../../docs/design/next-nuxt-parity.md).

**Never compose `localeDetector()` on this host.** It lives at module scope and is process-wide on
the App Router, so the detector would run once, at `init()`, and the first request's headers would
pin the locale for every later render. Use
`nextPlugin(localeDetectorPlugin(…), { runtime: "client" })` instead.

## 5. Where to go next

- **This binding:** [setup](https://comvi.io/docs/i18n/next) ·
  [locale routing](https://comvi.io/docs/i18n/next/routing) ·
  [server & client APIs](https://comvi.io/docs/i18n/next/server-client) ·
  [API reference](https://comvi.io/docs/i18n/api/next)
- **Guides:** [plurals & ICU](https://comvi.io/docs/i18n/pluralization) ·
  [typed keys](https://comvi.io/docs/i18n/type-safety) · [SSR](https://comvi.io/docs/i18n/ssr) ·
  [errors](https://comvi.io/docs/i18n/errors) · [limitations](https://comvi.io/docs/i18n/limitations)
- **Also here:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) ·
  [`docs/design/next-runtimes.md`](../../docs/design/next-runtimes.md) ·
  [`docs/design/next-nuxt-parity.md`](../../docs/design/next-nuxt-parity.md) ·
  [`docs/design/`](../../docs/design)
- **Upgrading from 0.4.x:** `use(plugin, options)` was Next's own scoped raw-plugin queue and is
  gone, and `useClient`, `useServer`, `useClientLazy` and `useServerLazy` are deleted rather than
  deprecated. [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §5 and
  [upgrade to 0.5](https://comvi.io/docs/i18n/guides/upgrade-to-v05/next) have one row per name.

Measured min+gz through the published exports map with `next` and `react` externalized, gated in CI.
Every fixture and the 0.4.1 comparison: [bundle size](https://comvi.io/docs/i18n/bundle-size).

| graph                                                            | measured as             | min+gz |
| ---------------------------------------------------------------- | ----------------------- | ------ |
| the recommended path: `createNextI18n` + `loader` + `nextPlugin` | `fw-next-root-composed` | 9450 B |

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
