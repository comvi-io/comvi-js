# Next.js: one shared config module per runtime, and nothing composed reaches the Edge

Status: accepted · Date: 2026-09-14 · Owner decision(s): 0.5.0 next single-entry convergence and
the server request contract; `createNextI18n` stops defaulting the compiler, 14.09.2026

## Context

Next.js cannot pass a class instance from a Server Component to a Client Component, so the host
cannot be handed across that boundary. It has three runtimes rather than one — server, client and
the Edge isolate that runs `middleware.ts` — and an Edge isolate ships and EXECUTES every module its
entry reaches on each cold start. That is why a Next setup needs five files where the other bindings
need three, which is the question a reader asks once and then never again.

## Decision

- **One shared config module, imported by both runtimes.** `src/i18n.ts` is imported by the
  `"server-only"` file that calls `setI18n()` and, one hop further, by the `"use client"` wrapper
  that passes `i18n` to `<I18nProvider>`. Each build evaluates it independently, so the client host
  matches the server's because it came from the same source, not because anything crossed the wire.
- **The catalog travels as the `messages` prop; the composition does not.** There is no wire format
  for a compiled `MessageCompiler` or a queued plugin.
- **The URL rules live in their own file**, built with `defineRouting` from `@comvi/next/routing`,
  and `middleware.ts` imports only that. Spread the same object into
  `createNextI18n({ ...routing, … })` so there is one source of truth.
- **Never compose `localeDetector()` on the App Router host.** Use
  `nextPlugin(localeDetectorPlugin(…), { runtime: "client" })`.
- **The shared instance contributes the catalog and the loader; the locale belongs to the request**
  and is passed explicitly to every `getI18n()` lookup.
- **`createNextI18n` composes capabilities and does not pick a compiler.** It composes ambient tag
  syntax, the loader with both `registerLoader` overloads, the plugin host, default params and
  devtools discovery; the `icuCompiler` default is gone.
- **`<I18nProvider>` passes `ssrInitialIsInitializing={false}` on the app's behalf**, so a `fallback`
  in a Next app gates only what the CLIENT host still has to initialize after hydration.

## Consequences

**A client-only config with different options silently diverges.** The client host has
`compiler: icuCompiler` and the CDN loader ONLY because the same
`createNextI18n({ … }).use(cdnLoader({ … }))` expression runs a second time in the browser. Omit it
from one side and nothing else keeps the two identical; no runtime hand-off will.
`test-apps/next/src/i18n/config.ts` in this repo follows exactly that shape.

**Two writes do travel from a request to the shared instance**, and the package's tests pin that
neither is the locale or the active namespaces. `addTranslations()` is additive and keyed by
`locale:namespace`, so a concurrent request can only write what the other would have loaded anyway —
though a first add for a given key does emit `namespaceLoaded`. `init()` loads the default namespace
once, at the instance's own configured locale, never at a request's. The internal server host type
carries no `t`, so a server helper that tried to translate without a locale would not compile, and a
request with no determinable locale throws before it triggers that one-time initialization.

### Why the URL rules live in a third file

A `middleware.ts` that does `import { routing } from "./i18n/config"` pulls core, the loader, the
plugin host, devtools, the tag grammar and whatever compiler the config names into the Edge isolate
— and runs `createNextI18n()` and `registerLoader()` there — for one plain object: 30.3 KB across 25
modules, against 3.8 KB across 7 with a `defineRouting` file (esbuild, minified, Next's externals,
measured on a config that names `compiler: icuCompiler`).

```ts title="src/i18n/routing.ts"
// The URL rules, and nothing else. No host, no core, no capability.
import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({
  locales: ["en", "uk", "de"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
```

## Alternatives rejected

- **Handing the composed host from a Server Component to a Client Component** — Next cannot pass a
  class instance across that boundary; `I18nClientProvider` is the workaround every quickstart uses.
- **A separate client-only config module** — the two hosts then diverge on any option one side
  forgets, with nothing to catch it.
- **Importing `routing` from the config module in `middleware.ts`** — 30.3 KB across 25 modules in
  the Edge isolate, running `createNextI18n()` and `registerLoader()` per cold start, for one object.
- **Declaring `locales` in both the routing and the host file** — one source of truth or two routes
  that disagree about what exists.
- **Composing `localeDetector()` on the App Router host** — module scope is process-wide, so the
  detector would run once at `init()` and the first request's headers would pin every later render.
- **`createNextI18n` defaulting to `icuCompiler`** — it was the last constructor in the repo to turn
  ICU on by itself, and one host quietly compiling a grammar every other host refuses is a
  difference that only shows up when a catalog moves between them.
- **Gating the Next server render behind `fallback` by default** — the server render already has the
  catalog, so gating it would swap correct content for a spinner. A server render with no catalog
  passes `ssrInitialIsInitializing={true}` explicitly.

## Where it lives

- `createNextI18n` and its `compiler` option — `packages/next/src/createNextI18n.ts`;
  `createComposedNextI18n` — `packages/next/src/composedHost.ts`
- the Server-to-Client constraint, in its doc comment — `packages/next/src/client/I18nProvider.tsx`
- `defineRouting` — `packages/next/src/routing/defineRouting.ts`; `createMiddleware` —
  `packages/next/src/middleware.ts`; `nextPlugin` — `packages/next/src/index.ts`
- `setI18n` / `getI18n` and the server host type — `packages/next/src/server.ts`

## Related

- [SSR across frameworks](ssr.md) · [Composition](composition.md) · [ICU](icu.md)
- [`@comvi/next` README](../../packages/next/README.md)
