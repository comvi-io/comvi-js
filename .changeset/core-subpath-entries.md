---
"@comvi/core": minor
---

New subpath entries decompose the core so apps pay only for what they use:

- `@comvi/core` — `createI18n` with the simple `{param}` compiler only. No ICU plural/select machinery and no tag syntax in the module graph. The `compiler` option injects ICU per instance. (This host started life as the `/slim` subpath; the single-entry convergence in this same release made it THE entry and deleted `/slim`.)
- `@comvi/core/icu` — pure, side-effect-free subpath exporting `icuCompiler` (its only public home). Combine with the root: `createI18n({ ..., compiler: icuCompiler })` for inline catalogs, or `.with(icu())` before any catalog for remote ones.
- `@comvi/core/tags` — tag interpolation toolbox: importing it registers tag syntax ambiently (string-API `t()` parses `<tag>…</tag>` everywhere); also exports `registerTagSyntax()` (returns a disposer), the `tagSyntaxExtension` object for per-call activation, and the VirtualNode helpers (`createElement`, `createTextNode`, `createFragment`, `isVirtualNode`).
- `@comvi/core/loader` — pure, side-effect-free subpath carrying the async-loading capability: `attachLoader` / `loader()` (composes it onto any host) plus `createImportMapLoader` and the `LoaderFn` / `LoaderResult` / `I18nLoaderApi` types.
- `@comvi/core/plugins` — pure, side-effect-free subpath carrying the plugin host: `attachPlugins` (`use`, locale detector, missing-key callbacks, post-processor registration, plugin data) plus the `I18nPlugin` / `I18nPluginFactory` / `PluginOptions` / `I18nPluginHost` types.
- `@comvi/core/devtools` — pure, side-effect-free subpath carrying browser-extension discovery: `attachDevtools(i18n, { instanceId, exposeGlobal })` assigns `instanceId`, publishes the instance on the `window.__COMVI__` queue (protocol v2, mixed-version safe) and removes it again on `destroy()`, plus the `ComviQueue` / `ComviQueueEntry` / `ComviHook` / `DevtoolsOptions` types.

Tag activation is dual-channel: ambient registration via import (string-API fallback) or per call through `tagInterpolation.extensions` — the ordering-proof channel `<T>`/`prepareTranslation` use, immune to bundler side-effect stripping.

The template cache keys on compiler identity and the effective syntax-extension set, so hosts with different compilers or extension sets in one process never poison each other. (When this change landed the root was still batteries-included; the single-entry convergence in this same release made it the base host — ICU is `compiler: icuCompiler` and tag syntax is `import "@comvi/core/tags"`.) `sideEffects` changed from `false` to an array listing exactly the tag-registration chunk.

The host ships a narrowed surface. Async loading and plugin registration are not on a base instance — they are absent from the module graph, not disabled by a flag — and TypeScript reports their use as a compile error rather than letting it fail at runtime. Compose them back outside-in:

**Scope note:** the base host is what **every** framework binding runs on in this release. `@comvi/vue`, `@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/next` and `@comvi/nuxt` now demand `WrapperI18nHost` (`I18nCoreInstance & I18nCoreExtraApi`) — exactly the surface a base host implements — so `createI18n` from `@comvi/core` and any `attach*` / `.with(…)` composition of it all work, and a binding's own graph no longer drags ambient tag registration into your bundle. The price is that the loader/plugin members left `useI18n()` for the dedicated `useI18nLoader()` / `useI18nPlugins()` acquisition APIs: see each binding's own entry in this release for its migration table, its codemod command and its measured whole-graph numbers. The measured sizes below are the core entry alone; the per-binding support matrix in `packages/core/README.md` carries the framework-app numbers.

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";

const i18n = attachPlugins(attachLoader(createI18n({ locale: "en" })));
```

Attach `attachLoader` **before** `attachPlugins` whenever a hosted plugin registers a loader (for example `@comvi/plugin-fetch-loader`): plugins run during `init()` and call `registerLoader` on the instance, so the loader capability has to be there by then. The attach functions are idempotent and install their members as **non-enumerable own properties** with ordinary method descriptors, so `Object.keys(i18n)`, spread copies and `JSON.stringify` are unaffected.

Three members moved off the base surface into `@comvi/core/loader`, where the only code that can exercise them lives: `addActiveNamespace`, `addActiveNamespaces` (activation only matters when something loads namespaces — a base host self-activates through `addTranslations`) and `onLoadError` (only a loader can emit `loadError`). `createImportMapLoader` moved from `@comvi/core` to `@comvi/core/loader`. All four subpaths first ship in this release.

In a graph without a tag extension — the base host, with or without `/icu` — `<tag>…</tag>` is not syntax and stays in the output as literal text (development warns once per template); `import "@comvi/core/tags"` or a per-call `tagInterpolation.extensions` restores parsing. Non-primitive parameter values are unchanged on every entry: `t()` coerces them into the string, `tRaw()` preserves them as a parts array.

Measured min+gz when this change landed (HISTORICAL — later changes in this same release moved every number; the current baselines live in `scripts/size-budgets.json`): the base host 5,563 B, + `/icu` 6,434 B, + `/loader` + `/plugins` 6,804 B, the fully composed graph 8,519 B.

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
