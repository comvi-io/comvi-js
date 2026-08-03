---
"@comvi/react": minor
---

**Added: `@comvi/react/slim` — the single-package slim surface.** Building a slim app used to take two packages: the host constructor from `@comvi/core/slim`, the bindings from `@comvi/react`. This entry carries both, so an app names one package and nothing else.

```ts
import { attachLoader, createI18n, icuCompiler } from "@comvi/react/slim";
```

### What is on it

| export                           | what it is                                                  |
| -------------------------------- | ----------------------------------------------------------- |
| `createI18n`                     | `@comvi/core/slim`'s constructor — builds the host          |
| `icuCompiler`                    | from `@comvi/core/icu` — pass as `createI18n({ compiler })` |
| `attachLoader`, `flattenCatalog` | from `@comvi/core/loader`                                   |
| `attachPlugins`                  | from `@comvi/core/plugins`                                  |
| `attachDevtools`                 | from `@comvi/core/devtools`                                 |
| every binding                    | identical to `@comvi/react`, minus the root re-exports      |

There is no react-side wrapper object to build — the host goes straight into `<I18nProvider i18n={…}>` — so the preset IS core-slim's `createI18n`, re-exported. Attaching a capability is not configuring it: `attachLoader(host)` installs the API, `host.registerLoader(fn)` still gives it something to load.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings (`slim.attachLoader === attachLoader`), from core's PURE subpaths only — never `export *`, which webpack development cannot prune, and never through another wrapper, which it cannot reconnect either. The bundler-matrix case `next-client-slim-preset` asserts that the icu, plugins and devtools subpaths never enter an app's module graph — webpack **and** vite, development **and** production — while the capability the app does attach works.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently, and `<T>` already owns that import in its own dist chunk.

### Measured

Whole-app comvi graph, min+gz, framework peer dependency externalized (`node scripts/size-check.mjs`): the single-package recipe is **6522 B**, **1 B under** the two-package one.

### Pick one entry per app

`@comvi/react` and `@comvi/react/slim` are separate build passes, so their React contexts are distinct objects — one from each will not see the other. `/slim` is a superset of the bindings, so there is never a reason to mix.

Nothing is removed and no existing import path changes. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.
