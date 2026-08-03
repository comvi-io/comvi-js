---
"@comvi/next": minor
---

**Added: `createSlimI18n` and the capability toolkit on both `@comvi/next/client` and `@comvi/next/server`.** A next app no longer names `@comvi/core` to build a slim host on either side of the boundary.

```tsx
"use client";
import { createSlimI18n, I18nProvider } from "@comvi/next/client";

// hydrated from the catalog the server serialized; client hosts do not load
const i18n = createSlimI18n({ locale: "en", defaultNs: "default" });
```

```ts
import "server-only";
import { attachLoader, createNextI18nFromHost, createSlimI18n } from "@comvi/next/server";

export const { i18n, routing } = createNextI18nFromHost(
  () => {
    const host = attachLoader(createSlimI18n({ locale: "en", defaultNs: "default" }));
    host.registerLoader(myLoader);
    return host;
  },
  { locales: ["en", "de"], defaultLocale: "en", localePrefix: "as-needed" },
);
```

### Why the client's slim host has its own name

`@comvi/next/client` is not a `/slim` entry — it is next's only client surface, and its `createI18n` is the **root** constructor, published in 0.4.x. Rebinding that name to the slim constructor would silently drop ICU plurals and tag syntax out from under an existing app, so the slim host is `createSlimI18n` and the two live side by side. `@comvi/next/server` uses the same name for symmetry and exports **no** root constructor at all: a server graph that named the root entry would carry core's ambient tag registration, and the `next-server-on-slim` gate asserts it never does.

### What is on the two entries

| export                           | on          | what it is                                                      |
| -------------------------------- | ----------- | --------------------------------------------------------------- |
| `createSlimI18n`                 | both        | `@comvi/core/slim`'s constructor                                |
| `createI18n`                     | client only | the ROOT constructor, unchanged since 0.4.x                     |
| `icuCompiler`                    | both        | from `@comvi/core/icu` — pass as `createSlimI18n({ compiler })` |
| `attachLoader`, `flattenCatalog` | both        | from `@comvi/core/loader`                                       |
| `attachPlugins`                  | both        | from `@comvi/core/plugins`                                      |
| `attachDevtools`                 | both        | from `@comvi/core/devtools`                                     |

The server entry carries them because `NextServerHost = WrapperI18nHost & I18nLoaderApi` makes the loader **mandatory** for SSR — the one host an app cannot avoid composing should not require a second package to compose.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings, from core's PURE subpaths only — never `export *`, and never through `@comvi/react`, because webpack development reconnects a single `export … from` across one `sideEffects: false` package but not a two-package chain (the same reason `createI18n` was moved off react's re-export in this release). The `next-client-slim-preset` and `next-server-on-slim` matrix cases assert the icu, plugins and devtools subpaths never enter either graph — webpack **and** vite, development **and** production.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently, and `<T>` already owns that import.

### Measured

Whole-app comvi graph, min+gz, `next` and `react` externalized (`node scripts/size-check.mjs`): the single-package client is **6956 B** (+17 B over the two-package recipe), the single-package server **7117 B** (+47 B). Against the root server graph of 9938 B, the composed slim server saves **2821 B (−28.4%)**.

Nothing is removed and no existing import path changes. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.
