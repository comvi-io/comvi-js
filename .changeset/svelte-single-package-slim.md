---
"@comvi/svelte": minor
---

**Added: the `@comvi/svelte` root carries the whole toolkit.** Building an app used to take two packages: the host constructor from `@comvi/core`, the bindings from `@comvi/svelte`. The root now carries both, so an app names one package and nothing else.

```svelte
<script lang="ts">
  import { createI18n, icuCompiler, loader, setI18nContext } from "@comvi/svelte";

  setI18nContext(
    createI18n({ locale: "en", compiler: icuCompiler }).with(
      loader({ uk: () => import("./uk.json") }),
    ),
  );
</script>
```

### What is on it

| export                                       | what it is                                              |
| -------------------------------------------- | ------------------------------------------------------- |
| `createI18n`, `I18n`                         | core's base host — its constructor and its class        |
| `icuCompiler`, `icu`                         | from `@comvi/core/icu` — the compiler and the installer |
| `loader`, `attachLoader`, `flattenCatalog`   | from `@comvi/core/loader`                               |
| `plugins`, `attachPlugins`                   | from `@comvi/core/plugins`                              |
| `devtools`, `attachDevtools`                 | from `@comvi/core/devtools`                             |
| every store factory, the readers, `T`, types | the svelte bindings                                     |

There is no svelte-side wrapper object to build — the host goes straight into `setI18nContext(i18n)` — so the constructor IS core's own `createI18n`, re-exported by name. Both halves of ICU are here on purpose: `icuCompiler` is what an inline catalog takes as `createI18n({ compiler })`, and `icu()` is the installer a remote catalog needs **before** ingestion, so neither recipe makes a svelte app reach for a core subpath. Attaching a capability is not configuring it: `attachLoader(host)` installs the API, `host.registerLoader(fn)` still gives it something to load.

### Composing a capability: `.with(installer)`

The same release puts a composition pipe on every core host — `i18n.with(f)` **is** `f(i18n)` — and ships configured installers for the three capabilities. The root re-exports them, so composition stays inside the one import:

```ts
const i18n = createI18n({ locale: "en" }).with(loader({ uk: () => import("./uk.json") }));
```

`loader(map)` attaches the loader capability **and** registers the map. `plugins()` and `devtools(options)` are the same shape. The `attach*` functions stay as the low-level API and are installers themselves — `.with(attachLoader)` is the form to use for a plain `LoaderFn`, because it keeps the import-map adapter out of your bundle.

Published plugin packages ship a lowercase `.with(…)` installer each in this same release — `fetchLoader`, `localeDetector` and `inContextEditor` — which composes the capabilities its plugin needs and then routes into `use`. The uppercase plugin factories are unchanged: compose the host yourself, then `use` them on it.

### Why the re-exports cost nothing

They are **named** re-exports of core's own bindings (`svelte.attachLoader === attachLoader`), from core's PURE subpaths only — never `export *`, which webpack development cannot prune, and never through another wrapper, which it cannot reconnect either. Two bundler-matrix cases hold the line, on webpack **and** vite, in development **and** production: `svelte-default` calls no capability at all and asserts that the icu, loader, plugins and devtools subpath entries never enter its module graph, while `svelte-icu` calls `icuCompiler`, formats a real plural from the built bundle, and asserts the other three absent.

`@comvi/core/tags` is deliberately **not** re-exported: importing it registers tag syntax ambiently. `<T>` instead uses the pure `@comvi/core/rich-text` seam, so rendering rich text never changes string-API tag behavior.

### Measured

Whole-app comvi graph, min+gz, `svelte` externalized (`node scripts/size-check.mjs`). All four converged-entry fixtures are live:

| size fixture               | app shape                         | min+gz      |
| -------------------------- | --------------------------------- | ----------- |
| `fw-svelte-default`        | base host, no `<T>`               | **6412 B**  |
| `fw-svelte-default-t`      | base host + `<T>`                 | **8603 B**  |
| `fw-svelte-icu`            | base host + inline ICU            | **7298 B**  |
| `fw-svelte-full-composite` | full explicit composition + `<T>` | **11266 B** |

Each row is checked against the emitted module graph on every run, and each now carries a measured + 2% byte budget from the 0.5.0 re-baseline sweep. A size sentinel can only assert a module **absent**, so ICU's presence is the one claim no row above can make. The `svelte-icu` bundler-matrix case makes it positively instead, by formatting a real plural from the built bundle.

### One entry, one context key

The package publishes exactly one entry. `svelte-package` preserves modules, so this package never had the "a provider from one entry is invisible to a hook from the other" hazard the bundled wrappers did — every specifier here resolved to the same binding modules. What one entry buys is the end of two published surfaces that had to be kept in step, and the root re-exports those binding modules themselves rather than wrapping them, so the `getContext` key stays a single object.

Nothing else is removed and no 0.4.x import path changes. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.

> Rewritten in place at the single-entry convergence and at the svelte convergence
> that followed it (same release), which is why the file name still says `slim`:
> the separate base-host subpath this changeset was written against no longer
> exists, and `@comvi/core`'s root IS that base host — so every specifier above
> names the root, and every "the root has it already" claim reads against the
> base host. Svelte then converged the same way: it publishes its root and
> nothing beside it, and the subpath this file was originally about is gone. The
> 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` and `svelte-single-entry-convergence.md` for
> the breaks and the migrations.
