---
"@comvi/next": minor
---

**Added: the capability toolkit on both `@comvi/next/client` and `@comvi/next/server`.** A next app no longer names `@comvi/core` to build a host on either side of the boundary — the base constructor and all nine capability bindings are on the entry you already import.

```tsx
"use client";
import { createI18n, I18nProvider } from "@comvi/next/client";

// hydrated from the catalog the server serialized; client hosts do not load
const i18n = createI18n({ locale: "en", defaultNs: "default" });
```

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

### One constructor name, on two entries

`@comvi/next/client` is next's only client surface and `@comvi/next/server` is the SSR companion: the split is a RUNTIME split — which helpers are reachable from a server component versus a client component — never a host-tier split. Both expose the same base `createI18n`, so there is one direct-host API in this package. The semantics of that name changed in this release; `next-single-entry-convergence.md` leads with the break and carries the migration table.

`@comvi/next/server` exports **no** composed constructor and no tag entry: a server graph that reached for the 0.4 composed recipe would pull in ICU and core's ambient tag-registration chunk, and the `next-server-on-default` gate asserts neither ever arrives. The published composed host stays reachable exactly where it always was — `createNextI18n` from `@comvi/next`.

### What is on the two entries

| export                                     | on   | what it is                                                   |
| ------------------------------------------ | ---- | ------------------------------------------------------------ |
| `createI18n`                               | both | core's base host constructor, the same binding on each entry |
| `icu`, `icuCompiler`                       | both | the installer and the compiler — see the timing rule below   |
| `loader`, `attachLoader`, `flattenCatalog` | both | from core's pure `/loader` subpath                           |
| `plugins`, `attachPlugins`                 | both | from core's pure `/plugins` subpath                          |
| `devtools`, `attachDevtools`               | both | from core's pure `/devtools` subpath                         |

`CompilerLockedError` and `DevtoolsOptions` come with them as types. The server entry carries the toolkit because `NextServerHost = WrapperI18nHost & I18nLoaderApi` makes the loader **mandatory** for SSR — the one host an app cannot avoid composing should not require a second package to compose.

### Composing a capability: `.with(installer)`

The same release puts a composition pipe on every core host — `i18n.with(f)` **is** `f(i18n)` — and ships configured installers for the capabilities. These entries re-export them, so composition stays inside the one import:

```ts
const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
```

`loader(map)` attaches the loader capability **and** registers the map. `plugins()` and `devtools(options)` are the same shape. The `attach*` functions stay as the low-level API and are installers themselves — `.with(attachLoader)` is the form to use for a plain `LoaderFn`, because it keeps the import-map adapter out of your bundle.

`icu()` is the one installer with a timing rule: it may only run BEFORE the host has ingested any catalog. An inline constructor catalog therefore takes `compiler: icuCompiler` in the same call instead, and a late `icu()` throws own `code === "E_COMPILER_LOCKED"` rather than quietly failing.

Published plugin packages compose through `.with(<lowercase installer>)` or, for anything else, `.with(plugins())` and then `use`.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings, from core's PURE subpaths only — never `export *`, and never through `@comvi/react`, because webpack development reconnects a single `export … from` across one `sideEffects: false` package but not a two-package chain (the same reason `createI18n` comes straight from core on the client entry). The `next-client-default`, `next-client-icu` and `next-server-on-default` matrix cases assert that the capability subpaths an app did not reach for never enter its graph — webpack **and** vite, development **and** production.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently. `<T>` reaches React's pure `@comvi/core/rich-text` seam instead, so importing or rendering it leaves string-API `t()` markup literal.

### Measured

Whole-app comvi graph, min+gz, `next` and `react` externalized (`node scripts/size-check.mjs`): the default client is **7057 B** (`fw-next-client-default`) and the server on a composed base host is **7218 B** (`fw-next-server-default-loader`). Against the composed factory's 10120 B server graph, the composed base server saves **2902 B (−28.7%)**. The unused capability re-exports add nothing: they are not in the graph.

No existing import path is removed. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.

> Rewritten in place twice in the same release. At the single-entry convergence:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host. At single-entry P4: the two
> `@comvi/next` entries converged onto ONE direct-host constructor name, so the
> "two names for one host" section this changeset originally introduced is gone
> with the second name, and the entries gained `icu` + `CompilerLockedError` to
> complete the nine-name toolkit. See `next-single-entry-convergence.md` for the
> break and `core-single-entry-convergence.md` for the core break both ride on.
