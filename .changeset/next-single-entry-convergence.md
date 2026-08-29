---
"@comvi/next": minor
---

**BREAKING (0.x minor, WATCHDOG policy): `createI18n` from `@comvi/next/client` now builds the base host.** That name is published 0.4.x API — on the client entry, on `@comvi/next/server`, and on the `@comvi/next` root, which has re-exported the same binding since 0.4 — and in 0.4 it arrived with ICU, tag syntax, async loading, the plugin host and devtools discovery already attached. Core's convergence made that binding the base host, so a next app that calls `createI18n` from any of the three now gets those five as things it composes rather than things it already had. Read the table below before upgrading: ICU plurals THROW instead of rendering wrong text.

**`createNextI18n` from `@comvi/next` is NOT affected.** It composes ICU, ambient tags, the loader (both `registerLoader` overloads), the plugin host, nested constructor catalogs, default params and devtools discovery explicitly, inside this package, in the parity order the core suite pins — so a 0.4 app built on the published factory migrates by changing nothing at all. That is also the one-line escape hatch if you do not want to compose anything: keep calling it. Its host type is now published explicitly, as `NextComposedI18n<D>`.

Nothing about `<I18nProvider>`, `useI18n()`, `<T>`, the capability hooks, `createMiddleware`, `createNextI18nFromHost`, locale routing or navigation changes here. This is the direct-host constructor underneath them.

**Grep target for a tree built against 0.5 development:** the second constructor name that briefly stood beside `createI18n` on both entries for the bare host was `createSlimI18n`. It is deleted — one host, one name — and it never published, so there is no deprecation debt. `pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"` renames it, including aliased imports, and reports the two shapes it refuses to touch silently (a local `createI18n` already bound in the file, and an object shorthand whose key would be renamed with it).

### What a 0.4 next client app experiences

| 0.4 behaviour of `createI18n`                         | after                       | loudness                                        | migration                                                                                             |
| ----------------------------------------------------- | --------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ICU plurals, select, selectordinal                    | the default compiler throws | **dev AND prod throw** `E_ICU_SYNTAX`           | inline catalogs: `compiler: icuCompiler`; later catalogs: `.with(icu())` before the first one arrives |
| loader (`registerLoader`, `reloadTranslations`, …)    | absent until composed       | the loud capability error, at `useI18nLoader()` | `.with(loader(map))`, or `.with(attachLoader)` for a plain `LoaderFn`                                 |
| `.use(plugin)`, `onMissingKey`                        | absent until composed       | TS error + runtime `TypeError`                  | `.with(plugins())`, then `use(p)`                                                                     |
| devtools discovery (`instanceId`, `window.__COMVI__`) | absent                      | invisible to the browser extension (documented) | `.with(devtools({ instanceId }))`                                                                     |
| nested constructor catalogs                           | stored verbatim             | dev warning                                     | `flattenCatalog(…)`, or compose `loader()`                                                            |
| tag markup through `t()` (`"<b>hi</b>"`)              | literal text                | dev warning; prod literal, never a throw        | render `<T>`, or `import "@comvi/core/tags"` at your own entry                                        |
| `createNextI18n`, every hook, `<T>`, routing          | untouched                   | —                                               | —                                                                                                     |

Every installer that table names is re-exported from BOTH host entries — `@comvi/next/client` and `@comvi/next/server` — so each migration stays inside the specifier you already import. The `@comvi/next` root carries the base `createI18n` it published in 0.4 beside `createNextI18n`; the installers live on the two host entries, because that is where a host gets built.

### The server entry converged to the same one name

`@comvi/next/server` exports that same base `createI18n` — the client/server split is a runtime split (which helpers are reachable), never a host-tier split, so the package has ONE direct-host constructor name on two entries. `createNextI18nFromHost` is unchanged and still takes the host you composed, with `NextServerHost = WrapperI18nHost & I18nLoaderApi` making the loader mandatory for SSR:

```ts
import "server-only";
import { createI18n, createNextI18nFromHost, loader } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () =>
    createI18n({ locale: "en", defaultNs: "default" }).with(
      loader({ uk: () => import("./uk.json") }),
    ),
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

### ICU has two shapes on these entries, and the wrong one throws

`icuCompiler` is a compiler and `icu()` is an installer, so which one you need depends on where the catalog comes from:

```tsx
// INLINE — the constructor ingests the catalog, so choose the compiler in the same call.
import { createI18n, icuCompiler } from "@comvi/next/client";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });

// LATER — a hydrated client catalog, or anything an SSR loader fetches.
import { createI18n, icu, loader } from "@comvi/next/server";

const host = createI18n({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any catalog reaches the host — a constructor `translation`, an `addTranslations` call, or a loader merge — and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"` before mutating anything. So `createI18n({ translation }).with(icu())` is invalid by construction: pass `compiler: icuCompiler` there instead. Clearing translations never unlocks it. `CompilerLockedError` is exported for typing that failure, and both entries now carry the identical nine-name toolkit (`icu`, `icuCompiler`, `loader`, `attachLoader`, `flattenCatalog`, `plugins`, `attachPlugins`, `devtools`, `attachDevtools`), so a next app never names `@comvi/core` for either shape.

A client host is hydrated rather than loaded, so the installer form is the usual one there: nothing is ingested at construction, and the catalog arrives through `<I18nProvider messages>`.

### The tag residual

`t("Click <b>here</b>")` returns that markup as text: neither `@comvi/next` entry registers tag syntax ambiently, and `@comvi/core/tags` is deliberately not re-exported from either. Development warns the first time, production stays literal and never throws — a literal `<b>` is visibly broken in review, unlike a plausible-looking plural. Render `<T>` (it passes the tag extension per call through the pure rich-text seam, so it needs no ambient registration) or `import "@comvi/core/tags"` once at your own entry if you want tag interpolation through `t()` itself. `@comvi/next/server` names no tag-registering entry at all.

### Measured

Whole comvi graph, min+gz, `next` and `react` externalized (`node scripts/size-check.mjs`); every figure below is the measurement recorded in `scripts/size-budgets.json`. The published composed factory is **10120 B** (`fw-next-composed-factory`, 10128 B budget, 8 B headroom) and pins the preservation claim behaviourally as well, through `packages/next/tests/composed-contract.test.ts`. The direct-host recipes: server on a composed base host **7218 B** (`fw-next-server-default-loader`), default client **7057 B** (`fw-next-client-default`) — so moving a server off the composed factory saves **2902 B (−28.7%)**, and a default client bundle is **3063 B (−30.3%)** lighter than that factory's graph. The three further client rungs are measured too, each gated on its module graph with a measured + 2% budget: `fw-next-client-default-t` **8939 B** (default plus `<T>`), `fw-next-client-icu` **7936 B** (plus the ICU compiler) and `fw-next-client-full-composite` **11580 B** (ICU, loader, plugins, devtools and `<T>` on one host — the ceiling a fully composed 0.4 client migrates to).

Every one of those rows asserts, from the bundler's module graph rather than an output-text grep, that ambient tag registration and every capability the recipe did not buy stay out; the client rows also assert that no server module (the host factory, the once-cell, next's loader code) reaches a client bundle. Three bundler-matrix cases run the published tarball on webpack and vite in development and production: `next-client-default` (no capability), `next-client-icu` (formats a plural for real, proving the ICU re-export is shipped and not just typed) and `next-server-on-default`.

See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4 for the next walkthrough and `core-single-entry-convergence.md` for the core break this one rides on.
