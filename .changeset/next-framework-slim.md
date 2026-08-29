---
"@comvi/next": minor
---

**BREAKING (0.5.0 — a 0.x minor, WATCHDOG policy):** `@comvi/next` gains a server factory that takes the host you composed, the server i18n becomes a once-cell that refuses two configuration sources, and the client inherits react's D′ surface (framework-slim P5).

### New: `createNextI18nFromHost(host, options)`

Exported from **`@comvi/next/server`** and nowhere else. `createNextI18n` keeps its exact signature and behavior — its users see no churn beyond the inherited react hook migration.

```typescript
// i18n/index.ts
import "server-only";
import { attachLoader, createI18n, createNextI18nFromHost } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () => {
    const host = attachLoader(createI18n({ locale: "en", defaultNs: "default" }));
    host.registerLoader(myLoader);
    return host;
  },
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

- `host: () => NextServerHost<D>` where `NextServerHost<D> = WrapperI18nHost<D> & I18nLoaderApi`. The server always needs the loader; ICU and tag interpolation enter the graph only if your host factory composes them.
- Options are **routing only** (`locales`, `defaultLocale`, `localePrefix`, `pathnames`). Locale, fallback, namespaces, translations, API key, tags/ICU, loader and plugins belong to the host factory — they are not silently reapplied or ignored, they do not exist on the options type.
- The result is exactly `{ i18n, routing }`. There are no `.use*` methods: plugin composition happens where the instance is constructed. Your host type is preserved exactly, so `result.i18n` is the composed type you returned, not a widened one.
- `host()` is **not** called when the factory returns. The first `result.i18n` access **or** the first server helper that needs the instance (`getI18n()`, `loadTranslations()`) resolves it — two entry points into one cell, no required initialization order, exactly one call, memoized synchronously.

### BREAKING: `setI18n` no longer overwrites silently

0.4.x let a second `setI18n(other)` replace the instance, last write wins. 0.5.0 treats two configuration sources as the programming error it is and throws — in development **and** production — naming both sources:

```
[comvi/next] i18n already configured by createNextI18nFromHost(); setI18n() is a second source. Configure it once — only a same-instance setI18n() repeats.
```

- `setI18n(i18n)` keeps its exact public signature and stays the supported way to configure a `createNextI18n` result.
- Calling `setI18n` again with the **same** instance is a no-op (setup modules commonly re-run).
- Everything else throws: a different instance, a `createNextI18nFromHost` registration on top of `setI18n` (or the reverse), or a second registration.

**Migration:** configure the server i18n from one source, once per process. Test suites that previously re-`setI18n`'d between cases need a fresh cell: vitest isolates module state per test file, and in-repo suites call the `@internal` `_resetServerI18n()` from `@comvi/next/dist/server/cache` (deliberately not part of the `@comvi/next/server` public surface, and asserted absent from the client graph). In Next development, a recompile re-evaluates the module and the cell starts empty; if a partial reload ever re-runs a setup module against a surviving cell, the conflict throw is the correct signal — restart the dev server.

A host factory that throws propagates the error and leaves the cell retryable — the next access calls it again. A host factory that reads back the instance it is constructing (via `getI18nInstance()`, `getI18n()`, `loadTranslations()` or `result.i18n`) throws a cycle error instead of recursing.

### Client — inherits react's D′ migration

`@comvi/next/client` re-exports react's 0.5.0 surface, so the four capability
members left `useI18n()` here too. There is no next-specific hook API.

| 0.4.x                                                                       | 0.5.0                                                                                                                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `const { addActiveNamespace, reloadTranslations, onLoadError } = useI18n()` | `const { addActiveNamespace, addActiveNamespaces, reloadTranslations, onLoadError } = useI18nLoader()`                                                     |
| `const { onMissingKey } = useI18n()`                                        | `const { onMissingKey } = useI18nPlugins()`                                                                                                                |
| `const { t, reloadTranslations } = useI18n("ns")`                           | `const { t } = useI18n("ns"); const { reloadTranslations } = useI18nLoader();` — the namespace argument stays on `useI18n`, the capability hooks take none |
| a second `setI18n(other)` reconfiguring the server                          | one configuration source per process; test suites reset the cell (see above)                                                                               |

Both hooks are exported from `@comvi/next/client` alongside `useI18n`.

```
pnpm codemod:framework-slim "src/**/*.{ts,tsx,js,jsx}"
```

Exit `0` = clean or fully transformed, `2` = rewrites applied and manual items
remain (each printed as `path:line [shape] detail`; `--report report.json`
writes the same list as JSON). It handles pure, mixed, aliased and repeated
destructures and merges into an existing capability destructure; it refuses —
loudly, never silently — rest spreads, computed keys, hook results stored in a
variable or crossing a function boundary, local-name collisions with the
introduced hooks, and relative-import call sites it cannot retarget. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

Troubleshooting: `addActiveNamespace is not a function` / `reloadTranslations is not a function` / `onLoadError is not a function` → `useI18nLoader()`. `onMissingKey is not a function` → `useI18nPlugins()`. `[comvi/next] i18n already configured by …` → two configuration sources; keep one.

`createI18n` is re-exported straight from `@comvi/core` instead of through
`@comvi/react` — same binding, same API, one hop fewer. The hop is what webpack
_development_ cannot prune: it reconnects a single `export … from` across one
`sideEffects: false` package, not a two-package chain, so the re-exported
module stayed in the bundle. It used to drag core's tag-registration chunk in
with it as well; `<T>` moving into its own dist chunk in this same release ended
that, so react's entry is side-effect-free now and the hop costs only itself.

The documented client recipe is a base host, built with that `createI18n` from
`@comvi/next/client` itself, hydrated from the catalog the server serialized:

```tsx
const messages = await loadTranslations(locale); // server
<I18nProvider i18n={clientI18n} locale={locale} messages={messages}>
  ...
</I18nProvider>;
```

### Measured

Whole comvi graph, min+gz, `next` and `react` externalized (`pnpm size`), measured at the framework-slim P5 checkpoint (HISTORICAL — the live rows, recorded in `scripts/size-budgets.json`, are `fw-next-composed-factory` **10120 B**, `fw-next-server-default-loader` **7218 B** and `fw-next-client-default` **7057 B**):

| app shape                                              | before         | after     |
| ------------------------------------------------------ | -------------- | --------- |
| next server, `createNextI18n` (the composed factory)   | 10127          | **10120** |
| next server, `createNextI18nFromHost` on base + loader | — (impossible) | **7219**  |
| next client, base host hydrated                        | — (impossible) | **6964**  |

**At that checkpoint, moving a next server off the composed factory onto a base + `attachLoader` host saved 2901 B min+gz (−28.7%); against the live rows the same move is 2902 B (−28.7%).** The saving depends on `getI18n` no longer value-importing a composed graph: with that one import still in place, the same companion-only graph measured 9882 B at the time and carried core's tag, plugin and ICU chunks with it.

Both direct-host fixtures assert through the bundler's module graph — never an output-text grep — that core's two tag-registration modules stay out, that the server graph carries neither next's own composed builder (`createNextI18n.js`) nor the ICU, plugins and devtools subpaths, and that the client graph carries neither any server module nor any loader code. Core's base entry is present in both: it is the host they compose on. The `next-server-on-default`, `next-client-default` and `next-client-icu` bundler-matrix cases are green on webpack and vite in development and production.

> Rewritten in place twice in the same release. At the single-entry convergence:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host, so every specifier above
> names the root. At single-entry P4: the two `@comvi/next` entries converged onto
> ONE direct-host constructor name (`createI18n`) and the size/matrix ladder was
> renamed after the surface it measures (`fw-next-client-default`,
> `fw-next-server-default-loader`, cases `next-client-default` /
> `next-client-icu` / `next-server-on-default`). The 0.4 composed semantics
> survive as the published `createNextI18n` factory and, à la carte, as a recipe
> (`.with(loader())`, `.with(plugins())`, `.with(devtools())`,
> `compiler: icuCompiler`, `import "@comvi/core/tags"`); see
> `next-single-entry-convergence.md` and `core-single-entry-convergence.md`.
