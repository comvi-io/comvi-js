---
"@comvi/core": minor
---

New subpath entries decompose the core so apps pay only for what they use:

- `@comvi/core/slim` — `createI18n` with the simple `{param}` compiler only. No ICU plural/select machinery and no tag syntax in the module graph. An optional `compiler` option injects ICU back per instance.
- `@comvi/core/icu` — pure, side-effect-free subpath exporting `icuCompiler` (its only public home). Combine with `/slim`: `createI18n({ ..., compiler: icuCompiler })`.
- `@comvi/core/tags` — tag interpolation toolbox: importing it registers tag syntax ambiently (string-API `t()` parses `<tag>…</tag>` everywhere); also exports `registerTagSyntax()` (returns a disposer), the `tagSyntaxExtension` object for per-call activation, and the VirtualNode helpers (`createElement`, `createTextNode`, `createFragment`, `isVirtualNode`).
- `@comvi/core/loader` — pure, side-effect-free subpath carrying the async-loading capability: `attachLoader` (composes it onto a slim instance) plus `createImportMapLoader` and the `LoaderFn` / `LoaderResult` / `I18nLoaderApi` types.
- `@comvi/core/plugins` — pure, side-effect-free subpath carrying the plugin host: `attachPlugins` (`use`, locale detector, missing-key callbacks, post-processor registration, plugin data) plus the `I18nPlugin` / `I18nPluginFactory` / `PluginOptions` / `I18nPluginHost` types.

Tag activation is dual-channel: ambient registration via import (string-API fallback) or per call through `tagInterpolation.extensions` — the ordering-proof channel `<T>`/`prepareTranslation` use, immune to bundler side-effect stripping.

The root entry `@comvi/core` is unchanged for existing users: `createI18n`/`new I18n()` keep full ICU behavior and the root registers tag syntax itself, so string-API tag interpolation keeps working with zero extra imports. The template cache now keys on compiler identity and the effective syntax-extension set, so mixed slim/full/tags graphs in one process never poison each other. `sideEffects` changed from `false` to an array listing exactly the tag-registration chunk.

`/slim` ships a narrowed surface. Async loading and plugin registration are not on a bare slim instance — they are absent from the module graph, not disabled by a flag — and TypeScript reports their use as a compile error rather than letting it fail at runtime. Compose them back outside-in:

```ts
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";

const i18n = attachPlugins(attachLoader(createI18n({ locale: "en" })));
```

Attach `attachLoader` **before** `attachPlugins` whenever a hosted plugin registers a loader (for example `@comvi/plugin-fetch-loader`): plugins run during `init()` and call `registerLoader` on the instance, so the loader capability has to be there by then. The attach functions are idempotent and install their members as **non-enumerable own properties** with ordinary method descriptors, so `Object.keys(i18n)`, spread copies and `JSON.stringify` are unaffected.

Three members moved off the base surface into `@comvi/core/loader`, where the only code that can exercise them lives: `addActiveNamespace`, `addActiveNamespaces` (activation only matters when something loads namespaces — bare slim self-activates through `addTranslations`) and `onLoadError` (only a loader can emit `loadError`). `createImportMapLoader` moved from `@comvi/core/slim` to `@comvi/core/loader`. All four subpaths first ship in this release, so no published import path changes.

In a graph without a tag extension — bare slim, and slim + `/icu` — `<tag>…</tag>` is not syntax and stays in the output as literal text; `import "@comvi/core/tags"` or a per-call `tagInterpolation.extensions` restores parsing. Non-primitive parameter values are unchanged on every entry: `t()` coerces them into the string, `tRaw()` preserves them as a parts array.

Measured min+gz through the published exports map: `/slim` 5,728 B, `/slim` + `/icu` 6,592 B, `/slim` + `/loader` + `/plugins` 6,875 B, root `@comvi/core` 8,583 B (the root entry is within 15 B of its pre-existing budget — the decomposition is paid for by slim, not charged to root).
