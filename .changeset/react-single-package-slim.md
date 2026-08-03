---
"@comvi/react": minor
---

**Added: `@comvi/react/slim` — the single-package slim surface.** Building a slim app used to take two packages: the host constructor from `@comvi/core`, the bindings from `@comvi/react`. This entry carries both, so an app names one package and nothing else.

```ts
import { createI18n, icuCompiler, loader } from "@comvi/react/slim";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
```

### What is on it

| export                                     | what it is                                                    |
| ------------------------------------------ | ------------------------------------------------------------- |
| `createI18n`                               | `@comvi/core`'s constructor — builds the host                 |
| `icuCompiler`                              | from `@comvi/core/icu` — pass as `createI18n({ compiler })`   |
| `loader`, `attachLoader`, `flattenCatalog` | from `@comvi/core/loader`                                     |
| `plugins`, `attachPlugins`                 | from `@comvi/core/plugins`                                    |
| `devtools`, `attachDevtools`               | from `@comvi/core/devtools`                                   |
| every binding                              | identical to `@comvi/react`, minus its `I18n` class re-export |

There is no react-side wrapper object to build — the host goes straight into `<I18nProvider i18n={…}>` — so the preset IS core's own `createI18n`, re-exported. Attaching a capability is not configuring it: `attachLoader(host)` installs the API, `host.registerLoader(fn)` still gives it something to load.

### Composing a capability: `.with(installer)`

The same release puts a composition pipe on every core host — `i18n.with(f)` **is** `f(i18n)` — and ships configured installers for the three capabilities. This entry re-exports them, so composition stays inside the one import:

```ts
const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
```

`loader(map)` attaches the loader capability **and** registers the map. `plugins()` and `devtools(options)` are the same shape. The `attach*` functions stay as the low-level API and are installers themselves — `.with(attachLoader)` is the form to use for a plain `LoaderFn`, because it keeps the import-map adapter out of your bundle.

Published plugin packages are unchanged: compose the host, then `use` them. That is the current recipe, not the final one — plugin packages will become directly `.with`-able in a follow-up.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings (`slim.attachLoader === attachLoader`), from core's PURE subpaths only — never `export *`, which webpack development cannot prune, and never through another wrapper, which it cannot reconnect either. The bundler-matrix case `next-client-slim-preset` asserts that the icu, plugins and devtools subpaths never enter an app's module graph — webpack **and** vite, development **and** production — while the capability the app does attach works.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently, and `<T>` already owns that import in its own dist chunk.

### Measured

Whole-app comvi graph, min+gz, framework peer dependency externalized (`node scripts/size-check.mjs`): the single-package recipe is **6532 B**, the same as the two-package one to the byte.

### Pick one entry per app

`@comvi/react` and `@comvi/react/slim` are separate build passes, so their React contexts are distinct objects — one from each will not see the other. `/slim` is a superset of the bindings, so there is never a reason to mix.

Nothing is removed and no existing import path changes. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
