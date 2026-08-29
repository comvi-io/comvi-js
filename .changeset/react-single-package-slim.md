---
"@comvi/react": minor
---

**Added: the `@comvi/react` root carries the whole toolkit.** Building an app used to take two packages: the host constructor from `@comvi/core`, the bindings from `@comvi/react`. The root now carries both, so an app names one package and nothing else.

```ts
import { createI18n, icuCompiler, loader } from "@comvi/react";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
```

### What is on it

| export                                     | what it is                                              |
| ------------------------------------------ | ------------------------------------------------------- |
| `createI18n`, `I18n`                       | core's base host — its constructor and its class        |
| `icuCompiler`, `icu`                       | from `@comvi/core/icu` — the compiler and the installer |
| `loader`, `attachLoader`, `flattenCatalog` | from `@comvi/core/loader`                               |
| `plugins`, `attachPlugins`                 | from `@comvi/core/plugins`                              |
| `devtools`, `attachDevtools`               | from `@comvi/core/devtools`                             |
| every hook, `I18nProvider`, `T`, the types | the react bindings                                      |

There is no react-side wrapper object to build — the host goes straight into `<I18nProvider i18n={…}>` — so the constructor IS core's own `createI18n`, re-exported by name. Both halves of ICU are here on purpose: `icuCompiler` is what an inline catalog takes as `createI18n({ compiler })`, and `icu()` is the installer a remote catalog needs **before** ingestion, so neither recipe makes a react app reach for a core subpath. Attaching a capability is not configuring it: `attachLoader(host)` installs the API, `host.registerLoader(fn)` still gives it something to load.

### Composing a capability: `.with(installer)`

The same release puts a composition pipe on every core host — `i18n.with(f)` **is** `f(i18n)` — and ships configured installers for the three capabilities. The root re-exports them, so composition stays inside the one import:

```ts
const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
```

`loader(map)` attaches the loader capability **and** registers the map. `plugins()` and `devtools(options)` are the same shape. The `attach*` functions stay as the low-level API and are installers themselves — `.with(attachLoader)` is the form to use for a plain `LoaderFn`, because it keeps the import-map adapter out of your bundle.

Published plugin packages ship a lowercase `.with(…)` installer each in this same release — `fetchLoader`, `localeDetector` and `inContextEditor` — which composes the capabilities its plugin needs and then routes into `use`. The uppercase plugin factories are unchanged: compose the host yourself, then `use` them on it.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings (`react.attachLoader === attachLoader`), from core's PURE subpaths only — never `export *`, which webpack development cannot prune, and never through another wrapper, which it cannot reconnect either. Two bundler-matrix cases hold the line, on webpack **and** vite, in development **and** production: `react-default` calls no capability at all and asserts that the icu, loader, plugins and devtools subpath entries never enter its module graph, while `react-icu` calls `icuCompiler`, formats a real plural from the built bundle, and asserts the other three absent.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently. `<T>` instead uses the pure `@comvi/core/rich-text` seam in its own dist chunk, so rendering rich text never changes string-API tag behavior.

### Measured

Whole-app comvi graph, min+gz, `react` externalized (`node scripts/size-check.mjs`). All four converged-entry fixtures are live with measured +2% budgets:

| size fixture              | app shape                         | min+gz      |
| ------------------------- | --------------------------------- | ----------- |
| `fw-react-default`        | base host, no `<T>`               | **6622 B**  |
| `fw-react-default-t`      | base host + `<T>`                 | **8501 B**  |
| `fw-react-icu`            | base host + inline ICU            | **7506 B**  |
| `fw-react-full-composite` | full explicit composition + `<T>` | **11156 B** |

A size sentinel can only assert a module **absent**, so ICU's presence is the one claim no row above can make. The `react-icu` bundler-matrix case makes it positively instead, by formatting a real plural from the built bundle.

### One entry, one context

The package publishes exactly one entry, so there is one build pass and one React context object: an `<I18nProvider>` and a `useI18n()` in the same app always see each other, and no import path can put a second copy of the bindings in your graph.

Nothing else is removed and no 0.4.x import path changes. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.

> Rewritten in place at the single-entry convergence and at the react convergence
> that followed it (same release), which is why the file name still says `slim`:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host — so every specifier above
> names the root, and every "the root has it already" claim reads against the
> base host. React then converged the same way: it publishes its root and
> nothing beside it, and the subpath this file was originally about is gone. The
> 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` and `react-single-entry-convergence.md` for
> the breaks and the migrations.
