# Next.js runtimes: why the config module is evaluated twice, and what must not reach the Edge

Design note. `packages/next/README.md` has the five-setup-file quickstart. This file explains why it has
five files rather than three, which is the question a reader asks once and then never again.

The host is the i18n instance `createI18n` returns.

## The catalog travels; the composition does not

`src/i18n.ts` is imported on both sides — by `src/i18n.server.ts` (`"server-only"`) and, one
hop further, by `I18nClientProvider.tsx` (`"use client"`) — because Next.js cannot pass a class
instance from a Server Component to a Client Component
(`packages/next/src/client/I18nProvider.tsx`'s doc comment states this constraint;
`I18nClientProvider` is the workaround every quickstart in that README uses).

Next therefore bundles `config.ts` into BOTH the server build and the client build, and each build
EVALUATES the module independently: `createComposedNextI18n`
(`packages/next/src/composedHost.ts`) runs once on the server, producing the instance `setI18n()`
registers, and runs again inside the browser, producing a second, unrelated instance, when the
client bundle executes `config.ts` to get `i18n` for `<I18nProvider i18n={i18n}>`.

The catalog the server loaded does travel, as the `messages` prop. The instance's composition does
not — there is no wire format for a compiled `MessageCompiler` or a queued plugin to cross a
serialization boundary.

So the client host has `compiler: icuCompiler` and the CDN loader ONLY because the exact same
`createNextI18n({ … }).use(cdnLoader({ … }))` expression in `config.ts` runs a second time, in the
browser, producing an equivalent host from equivalent source. If a project instead built a
client-only config with different options — or omitted `.use(cdnLoader(…))` from one side — the two
hosts would silently diverge: one shared config module, imported by both runtimes, is what keeps
`compiler` and the loader identical, and no runtime hand-off does.

`test-apps/next/src/i18n/config.ts` and `src/i18n/index.ts` in this repository follow exactly that
shape: one shared config module, one `"server-only"` file that calls `setI18n`, one `"use client"`
wrapper that imports the config module a second time.

Three sentences is what a reader needs beside the quickstart, and that is what the README carries:
`config.ts` runs once per runtime, the catalog travels as `messages`, the composition does not.

## Why the URL rules live in a third file

`middleware.ts` runs in the Edge runtime, and an Edge isolate ships and EXECUTES every module its
entry reaches on each cold start. A `middleware.ts` that does
`import { routing } from "./i18n/config"` therefore pulls core, ICU, the loader, the plugin host,
devtools and the tag grammar into middleware — and runs `createNextI18n()` and `registerLoader()`
there — for one plain object: 30.3 KB across 25 modules, against 3.8 KB across 7 with a
`defineRouting` file (esbuild, minified, Next's externals).

```ts title="src/i18n/routing.ts"
// The URL rules, and nothing else. No host, no core, no capability.
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({
  locales: ["en", "uk", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
```

```ts title="src/middleware.ts"
import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
```

Spread the same object into `createNextI18n({ ...routing, … })` in `src/i18n.ts` so there is
still exactly one source of truth for the URL rules. Declare `locales` separately in both files and
`/uk/…` becomes a real route in one and an unknown one in the other.

## Never compose `localeDetector()` on the App Router host

It lives at module scope and is process-wide, so the detector would run once, at the host's
`init()`, and the first request's headers would pin the locale for every later render.
`nextPlugin(LocaleDetector(…), { runtime: "client" })` is the form: the browser has exactly one
visitor, and the server's locale is the request's — `getI18n()` passes it explicitly.

## The server request contract

The i18n instance lives at module scope and is shared by every concurrent request in a server
process. It contributes the translation **catalog** and the **loader**; the locale belongs to the
request. Every lookup `getI18n()` hands you names the request locale explicitly, so two concurrent
renders at different locales cannot race, and the internal server host type carries no `t`, so a
server helper that tried to translate without a locale would not compile. A request that cannot
determine its locale throws before it triggers the host's one-time initialization.

Two writes still travel from a request to the shared instance, and the package's tests pin that no
request writes the instance's locale or its active namespaces. `addTranslations()` runs on the
server: it is additive and keyed by `locale:namespace`, so a concurrent request can only write what
the other would have loaded anyway (a first add for a given key does emit `namespaceLoaded`). And
`init()` loads the default namespace once, at the instance's own configured locale, never at a
request's. Validation of `routing.locales` also runs on the server, so a bad `[locale]` segment
reaches your `onError` in the server logs.

## `createNextI18n` carries ICU; `createI18n` does not

`createNextI18n` composes the 0.4 host explicitly inside the package, so its published behaviour is
preserved exactly: ICU, ambient tag syntax, the loader (with both `registerLoader` overloads), the
plugin host, default params and devtools discovery. ICU is still the `compiler` option there, but it
**defaults to `icuCompiler`** — that is what "behaviour-compatible with 0.4" means. Pass your own
`MessageCompiler` to opt out; `compiler: undefined` is not an opt-out, since the default still
applies.

`createI18n` on `@comvi/next/client` and `@comvi/next/server` has the opposite default: the base
host, carrying nothing you did not compose, ICU included. The two constructors are not peers — see
that README's reference section.

## `fallback` here is a post-hydration gate

`<I18nProvider>` forwards react's `fallback` and passes `ssrInitialIsInitializing={false}` on your
behalf: the server render already has the catalog (`getI18n()` / `loadTranslations()`), so it is
never gated, and neither is the hydration render that reads the same snapshot. A `fallback` in a
next app therefore covers only what the CLIENT host still has to initialize after hydration.

## Related

- [SSR across frameworks](ssr.md) · [Composition](composition.md) · [ICU](icu.md)
- [`@comvi/next` README](../../packages/next/README.md)
