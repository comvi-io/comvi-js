---
"@comvi/core": minor
---

New subpath entries decompose the core so apps pay only for what they use:

- `@comvi/core/slim` — `createI18n` with the simple `{param}` compiler only. No ICU plural/select machinery and no tag syntax in the module graph. An optional `compiler` option injects ICU back per instance.
- `@comvi/core/icu` — pure, side-effect-free subpath exporting `icuCompiler` (its only public home). Combine with `/slim`: `createI18n({ ..., compiler: icuCompiler })`.
- `@comvi/core/tags` — tag interpolation toolbox: importing it registers tag syntax ambiently (string-API `t()` parses `<tag>…</tag>` everywhere); also exports `registerTagSyntax()` (returns a disposer), the `tagSyntaxExtension` object for per-call activation, and the VirtualNode helpers (`createElement`, `createTextNode`, `createFragment`, `isVirtualNode`).

Tag activation is dual-channel: ambient registration via import (string-API fallback) or per call through `tagInterpolation.extensions` — the ordering-proof channel `<T>`/`prepareTranslation` use, immune to bundler side-effect stripping.

The root entry `@comvi/core` is unchanged for existing users: `createI18n`/`new I18n()` keep full ICU behavior and the root registers tag syntax itself, so string-API tag interpolation keeps working with zero extra imports. The template cache now keys on compiler identity and the effective syntax-extension set, so mixed slim/full/tags graphs in one process never poison each other. `sideEffects` changed from `false` to an array listing exactly the tag-registration chunk.
