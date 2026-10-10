---
"@comvi/vue": patch
---

`<T>` no longer breaks the build of apps that generate translation types.

- **Any key-closed program failed to compile.** `<T>` resolved its key at runtime and passed a
  plain `string` to `i18n.tRaw`, but closing `TranslationKeys` — what `comvi typegen` produces —
  narrows `tRaw`'s overloads to the registered literals, and to `never` for the namespaced one.
  A `string` matches none of them, so `src/components/T.ts` itself failed to type-check inside
  every consumer app that had generated types, while the package's own build (keys open,
  permissive fallback) stayed green and never showed it. The key is now passed as `never`, the
  same idiom `@comvi/react` and `@comvi/solid` already use for runtime keys.
- Guarded by a second, isolated tsc program that compiles `src` with the key registry CLOSED.
  It has to be its own program: `declare module` is global to whichever program contains it, so
  a key-closing augmentation placed in the main test project would narrow every sibling test's
  runtime-string call instead. `@comvi/react`, `@comvi/solid` and `@comvi/svelte` were checked
  the same way and are clean.
- Type-only change: no runtime code was touched.
