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

`@comvi/next` is the whole toolkit for a Next.js App Router app: it bundles `@comvi/core` and the
React bindings, so one install is enough. Server Components get translations server-side, so there
is no flash of untranslated content and no suspense waterfall for i18n.

One exception: the free formatting functions (`formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`) are not re-exported here. A component that calls one
directly imports it from `@comvi/core` and declares that package too — pnpm will not resolve it
transitively. `useI18n()` hands back bound formatters, which need no extra import.

Throughout this README, **the host** is the i18n instance `createNextI18n` returns as `i18n`.

📖 [Documentation](https://comvi.io/docs/i18n/next/) ·
⚖️ [Comvi vs next-intl](https://comvi.io/compare/next-intl/)

## 1. Install

```bash
npm install @comvi/next server-only
# Peers: next ^14 || ^15, react ^18 || ^19
```

`server-only` is the guard on the server module below: importing it from a Client Component becomes
a build error instead of a leaked host. It is its own package, so declare it in `dependencies`
rather than relying on a transitive copy.

## 2. Quick start — an inline catalog

Five setup files plus one client component to show the hook, and each exists for a reason
Next imposes. Two of them are the cost of the
App Router's server/client split: Next cannot pass a class instance from a Server Component to a
Client Component, so a `"use client"` wrapper imports the host itself, and a `"server-only"` module
registers it for the server helpers.

Three things to know about the shape, and nothing more is needed to use it:

- `src/i18n.ts` runs **once per runtime** — once in the server build, once in the client build.
- A catalog the server loaded travels to the client as `messages`.
- The host's **composition** does not travel. Both runtimes get it by evaluating the same file.

One call is not optional. The server helpers read the request locale from React's per-request
cache, which either `createMiddleware()` fills or you fill with **`setRequestLocale(locale)`**. This
quickstart has no middleware yet, so the layout calls it, and `getI18n()` throws
`[comvi/next] Locale not set.` if nothing did.

Runnable version: [`examples/next`](../../examples/next), which opens in
[StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/next) straight from the repository — see
[examples/README.md](../../examples/README.md) for the link pattern.

`createNextI18n` ingests the whole inline catalog at construction, so there is nothing to fetch and
no loading state to render for.

Unlike the other bindings' step 1, this one names `compiler: icuCompiler`. `createNextI18n`
composes ICU by default, so the line documents that default rather than adding a second step — which
is also why this catalog can already carry a plural where the other step 1s cannot.

```ts title="src/i18n.ts" check=group=next-quickstart-inline
import { createNextI18n, icuCompiler } from "@comvi/next";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  // `createNextI18n` composes ICU itself, so this line is the default rather than
  // a change; `createI18n` on the client/server entries does NOT, and needs it.
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

Nothing here calls `loadTranslations()` or passes `messages` to `<I18nProvider>`: the catalog is
inline, so both the server render and the client host already have it at construction.

Add locale-prefixed URLs with a `defineRouting` module and a middleware — see
[Locale routing](#locale-routing) below.

## 3. Connect to Comvi

Two additions. The host file gains the loader; the provider and the layout gain `messages`:

1. **`.use(cdnLoader({ cdnUrl }))`** from `@comvi/plugin-fetch-loader/cdn`, which sets up loading
   and registers the CDN plugin in one call.
2. **`await loadTranslations(locale)`** in the layout, handing the result to the provider as
   `messages`, so first paint never flashes untranslated content or races the CDN request.

`compiler: icuCompiler` stays exactly as in step 1.

```bash
npm install @comvi/plugin-fetch-loader
```

```ts title="src/i18n.ts" check=group=next-quickstart-cdn
import { createNextI18n, icuCompiler } from "@comvi/next";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

export const { i18n, routing } = createNextI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/<project>" }));
```

```ts title="src/i18n.server.ts" check=group=next-quickstart-cdn
import "server-only";
import { setI18n } from "@comvi/next/server";
import { i18n, routing } from "./i18n";

setI18n(i18n);

export { i18n, routing };
export { getI18n, loadTranslations, setRequestLocale } from "@comvi/next/server";
```

```tsx title="src/app/[locale]/I18nClientProvider.tsx" check=group=next-quickstart-cdn
"use client";

import { I18nProvider } from "@comvi/next/client";
import type { MessagesMap } from "@comvi/next/client";
import { i18n } from "@/i18n";

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
import { routing, loadTranslations, setRequestLocale } from "@/i18n.server";
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

  // REQUIRED before any server helper runs — see step 1.
  setRequestLocale(locale);

  // Loaded server-side and handed to the client as `messages`.
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

`page.tsx` and `Greeting.tsx` are unchanged from step 1.

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and read it off the
**Distributions** page.

**Never compose `localeDetector()` on this host.** It lives at module scope and is process-wide on
the App Router, so the detector would run once, at `init()`, and the first request's headers would
pin the locale for every later render. Use
`nextPlugin(LocaleDetector(…), { runtime: "client" })` instead.

## 4. Next.js API reference

### Server helpers

`getI18n()` returns the translation bag for the request locale. `loadTranslations(locale)` loads a
locale's catalog on the server and returns a serializable `TranslationsResult` to hand to the
provider as `messages` (structurally identical to the `MessagesMap` the provider's prop is typed
as: both are `Record<string, Record<string, TranslationValue>>`).
Both read the instance `setI18n(i18n)` registered, so that call must run first — import the
`"server-only"` module for its side effect.

`getI18n()` also needs the request **locale**, which it reads from React's per-request cache.
`createMiddleware()` fills that cache on every matched request; without middleware, or on a route
the matcher skips, call **`setRequestLocale(locale)`** in the layout or page before the first
helper. It is also what lets `generateStaticParams()` render these pages statically. Miss it and
the helper throws `[comvi/next] Locale not set. Call setRequestLocale(locale) in your
layout/page first, or configure middleware.` rather than guessing.
`getLocale()` is the same read on its own.

Next deduplicates `fetch()` across Server Components within one request, and the core loader
deduplicates concurrent requests for the same locale and namespace.

**Configure the server i18n once per process.** A second `setI18n(other)` throws, in development and
production, naming both sources. A same-instance `setI18n()` is a no-op.

### Locale routing

Put the URL rules in their own module and import them from both the middleware and the host.

```ts title="src/i18n/routing.ts"
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({
  locales: ["en", "uk", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed", // 'always' | 'as-needed' | 'never'
});
```

```ts title="src/middleware.ts"
import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
```

Then spread the same object into the host: `createNextI18n({ ...routing, fallbackLocale: "en" })`.
Declaring `locales` separately in both files makes `/uk/…` a real route in one and an unknown one in
the other.

**Import `routing` from a core-free module, never from the module that builds the host.** An Edge
isolate ships and executes every module its entry reaches, so a middleware that reaches `config.ts`
pulls the whole i18n graph into the Edge bundle for one plain object. The measurement and the
reasoning are in
[docs/design/next-runtimes.md](../../docs/design/next-runtimes.md#why-the-url-rules-live-in-a-third-file).

The middleware reads the locale from the URL path first, then cookies and the `Accept-Language`
header in your configured order. On a first visit without a stored locale it detects the language,
redirects to the localized URL, and persists the choice in a cookie.
`<Link>`, `usePathname()` and `useLocalizedRouter()` from `@comvi/next/navigation` are the
locale-aware navigation helpers. That is a separate `"use client"` subpath, so importing it never
pulls the host into a server module.

### `createNextI18n` versus `createI18n`

`createNextI18n`, from `@comvi/next`, is the recommendation: it builds the composed host, the
routing config, and the `.use(installer)` pipe in one call. Both quickstarts above use it.

It composes the 0.4 host explicitly, so its published behaviour is preserved exactly: ICU, ambient
tag syntax, the loader (with both `registerLoader` overloads), the plugin host, default params and
devtools discovery. **ICU defaults to `icuCompiler` here**; pass your own `MessageCompiler` to opt
out (`compiler: undefined` is not an opt-out, since the default still applies). The host type is
published as `NextComposedI18n<D>`.

`createI18n` on `@comvi/next/client` and `@comvi/next/server` is core's base host constructor, and
has the **opposite** default: it composes nothing you did not ask for, ICU included. It is not a
second option to weigh against `createNextI18n` — it exists for the host factory
`createNextI18nFromHost` takes, and for 0.4 callers migrating a direct `createI18n(...)` call.

`createNextI18nFromHost`, exported from `@comvi/next/server` and nowhere else, takes a host built
elsewhere plus routing-only options. Construction is eager: the factory runs once, inside the call,
and the instance it returns is both `result.i18n` and what `getI18n()` / `loadTranslations()`
resolve. The server always needs the loader
(`NextServerHost = WrapperI18nHost & I18nLoaderApi`).

```ts title="src/i18n/index.ts"
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

### Composing onto the result: `.use(installer)`

The result is `{ i18n, routing, use }`, and `use` is the same composition verb every host has:
`result.use(f)` is `f(result.i18n)`, handing back the same result with `i18n` retyped to whatever
the installer widened the host to.

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

Runtime and environment scoping live on the plugin form, in two Next-specific installers exported
from the root, `/client` and `/server`:

| installer                        | what it registers                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nextPlugin(plugin, options?)`   | `plugin`, run at `init()` only where `runtime` (`"client"` / `"server"`, omit for both) and `environment` (`"all"` / `"development"` / `"production"`) say |
| `nextPluginLazy(load, options?)` | the plugin `load()` resolves to (`() => Promise<plugin \| { default: plugin }>`), imported at most once and only where the scope says                      |

`options` also takes every plugin option (`required`, `timeout`, `onError`), forwarded to
`registerPlugin`. Both attach the plugin host if the chain has not already, exactly like
`definePlugin(fn)` — which is what an unscoped plugin of your own goes through. A plugin package goes
straight in through its lowercase installer (`cdnLoader(…)`, never `CdnLoader(…)`). A plugin scoped
out of the current runtime is still imported; `nextPluginLazy` is the form that defers the import
too.

An installer widens the host in place and returns it, and everything else in the result —
`setI18n(i18n)`, the provider, the server helpers — holds that one host. So an installer that hands
back a different object is refused with `code: "E_USE_HOST_IDENTITY"`, and a raw plugin handed to
`use` gets the same error with the ways out in its development message. TypeScript catches all
three misuses (an async installer, one that returns nothing, one that returns a copy) before
runtime.

### `<I18nProvider>` and the client hooks

`@comvi/next/client` re-exports react's whole surface under the same names, `useI18n`,
`useI18nHost`, `useI18nLoader`, `useI18nPlugins`, the selector hooks and `<T>`. Nothing sends you
back to `@comvi/react` for a hook, and there is no next-specific hook API — see the
[React README](../react#4-react-api-reference) for each one.

Next's provider takes `locale`, `messages` and `routing` in addition to react's props, and takes the
render locale from `locale` rather than `ssrLocale`. `fallback` is forwarded, but it is a
**post-hydration** gate here: the provider passes `ssrInitialIsInitializing={false}` on your behalf,
because the server render already has the catalog.

`<T>` is inherited from `@comvi/react`, with the same `components` shape — elements to clone:

```tsx
import { T } from "@comvi/next/client";

export function Help() {
  return <T i18nKey="help" components={{ link: <a href="/help" /> }} />;
}
```

Wrap the client provider in an error boundary to handle initialization failures; react's `onError`
prop reports them, and [react-error-boundary](https://github.com/bvaughn/react-error-boundary) is
the convenient shape.

### The six subpaths

| subpath                  | what you import from it                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `@comvi/next`            | `createNextI18n`, plus the capability toolkit below                                                                   |
| `@comvi/next/client`     | `<I18nProvider>`, every react hook, `<T>`, plus the toolkit                                                           |
| `@comvi/next/server`     | `setI18n`, `setRequestLocale`, `getI18n`, `getLocale`, `loadTranslations`, `createNextI18nFromHost`, plus the toolkit |
| `@comvi/next/navigation` | `<Link>`, `usePathname`, `useLocalizedRouter` — the locale-aware navigation helpers                                   |
| `@comvi/next/routing`    | `defineRouting`, `hasLocale`, `createGetPathname` — server-safe, no host in the graph                                 |
| `@comvi/next/middleware` | `createMiddleware`                                                                                                    |

The first three each carry the base host constructor and the identical capability toolkit, so the
host and its capabilities come from this package alone:

| export                         | what it is                                                             |
| ------------------------------ | ---------------------------------------------------------------------- |
| `createI18n`                   | core's base host constructor, the same binding on both runtime entries |
| `icuCompiler`                  | the ICU compiler, from core's pure `/icu` subpath                      |
| `loader`, `attachLoader`       | from core's pure `/loader` subpath                                     |
| `plugins`, `definePlugin`      | from core's pure `/plugins` subpath                                    |
| `devtools`                     | from core's pure `/devtools` subpath                                   |
| `nextPlugin`, `nextPluginLazy` | this package's runtime-scoped plugin installers                        |

`/routing` and `/middleware` deliberately carry none of it: they are what `middleware.ts` imports,
and an Edge isolate executes every module its entry reaches. `/navigation` is `"use client"`.

These are **named** re-exports of core's own bindings, from core's pure subpaths only, so the ones
you do not call are pruned; the bundler matrix asserts that from the emitted module graph. The
server entry carries the toolkit because `NextServerHost` makes the loader mandatory for SSR, and
the root carries it because a shared config module is imported by both runtimes and can name neither
runtime entry.

Neither entry re-exports `@comvi/core/tags`, the one side-effectful subpath: importing it registers
string-API tag syntax ambiently, and that stays your app's explicit call. The low-level
`attachPlugins` / `attachDevtools` pair is not re-exported either; import it from
`@comvi/core/plugins` / `@comvi/core/devtools`.

## 5. Server-side rendering and the two runtimes

Next is the one binding that **requires** a module-scope host: `setI18n()` registers one instance
per process and `getI18n()` resolves it. Nothing a request does writes that instance's locale or its
active namespaces, which is what makes sharing it safe. Solid, Svelte, Vue and Nuxt each forbid the
module-scope host that Next requires — the four rules are side by side in
[docs/design/ssr.md](../../docs/design/ssr.md), and the cross-framework guide on the site is at
[comvi.io/docs/i18n/guides/ssr/](https://comvi.io/docs/i18n/guides/ssr/).

Three sentences cover the hydration story, and they are the three from the quickstart: the config
module runs once per runtime, the catalog travels as `messages`, the composition does not. Why that
is so, what happens if two config modules diverge, and what must not reach the Edge runtime are in
[docs/design/next-runtimes.md](../../docs/design/next-runtimes.md).

## 6. Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key. One
augmentation serves every binding, generated by [`@comvi/cli`](../cli) from the platform or
[`@comvi/vite-plugin`](../vite-plugin) from local JSON. The declaration, the examples and what
TypeScript catches are in the
[root README](https://github.com/comvi-io/comvi-js#typed-translation-keys).

## 7. What it weighs

Measured min+gz through the published exports map, `next` and `react` externalized, and gated in
[`scripts/size-budgets.json`](../../scripts/size-budgets.json) at the recorded baseline + 5 %.

| graph                                                            | fixture                         | min+gz |
| ---------------------------------------------------------------- | ------------------------------- | ------ |
| server, `createNextI18nFromHost` on a composed base host         | `fw-next-server-default-loader` | 7372 B |
| client, base host hydrated                                       | `fw-next-client-default`        | 7354 B |
| the recommended path: `createNextI18n` + `loader` + `nextPlugin` | `fw-next-root-composed`         | 9450 B |

A fully composed 0.4-style client is the migration ceiling rather than a parity claim: 0.4 also
registered string-API tag syntax ambiently, and that is now an explicit `@comvi/core/tags` import
which neither next entry re-exports.

## 8. Where to go next

- **Loading from the platform:** [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) for API mode,
  namespace layout and offline fallbacks.
- **Design notes:** [Next runtimes](../../docs/design/next-runtimes.md) ·
  [composition](../../docs/design/composition.md) · [ICU](../../docs/design/icu.md) ·
  [rich text](../../docs/design/rich-text.md) · [SSR](../../docs/design/ssr.md) ·
  [limitations](../../docs/design/limitations.md)
- **Upgrading from 0.4.x:** `use(plugin, options)` was Next's own scoped raw-plugin queue and is
  gone, and the four delegates `useClient`, `useServer`, `useClientLazy` and `useServerLazy` are
  deleted rather than deprecated. Run `pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"`, then
  see [MIGRATION.md](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) for the rename
  table.
- **Full API:** [comvi.io/docs/i18n/next/](https://comvi.io/docs/i18n/next/)

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
