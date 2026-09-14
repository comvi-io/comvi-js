# Limitations: everything the library does not do

Design note. One list, so a reader evaluating Comvi i18n finds the gaps in one place instead of
discovering them one README at a time. Each entry says what happens instead, because a limitation
you can see is cheaper than one you hit in production.

The host is the object `createI18n` returns: it holds the catalog, the current locale and `t()`.

## ICU grammar

- **`number`, `date` and `time` argument types are not implemented, and are not planned.**
  `{price, number}` fails with `E_ICU_SYNTAX` rather than rendering something wrong. Format the
  value in code and interpolate it as a plain `{param}`, or quote the braces (`'{'…'}'`) to keep the
  text literal. Reasoning: [formatting.md](formatting.md#why-intl-rather-than-a-formatting-grammar).
- **The plural `offset:` form is not implemented.** Drop `offset:` and write the branches out.
- **`plural`, `selectordinal` and `select` are the whole of what the compiler implements**, each with
  a choice list. See [icu.md](icu.md#unsupported-argument-types).
- **A missing interpolation parameter renders as its own placeholder.** `t("greet")` on
  `"Hello, {name}!"` gives `"Hello, {name}!"` in 0.5, where 0.4 gave `"Hello, !"`, plus one
  development warning per template and parameter. An explicit `null` still renders as an empty
  string. Opt out with `missingParam: "drop"`. This is 0.5's most visible behaviour change; the
  [root README](https://github.com/comvi-io/comvi-js#upgrading-from-04x) lists it among the four.
- **ICU is off unless you name it.** Without `compiler: icuCompiler` a plural throws in development
  and renders literally in production. This is a choice, not an omission — the alternative is a
  plausible wrong answer — but it is the single most common first surprise.

## Server-side rendering

- **Solid: server-side LOADING is not supported.** `<I18nProvider>` initializes from a
  `createEffect`, and effects do not run during Solid's server render, so a catalog a loader would
  have fetched is absent server-side. An inline catalog renders fine.
  [Track progress in the issues](https://github.com/comvi-io/comvi-js/issues).
- **The module-scope rule is not the same in every framework.** Next requires one shared host; Solid,
  Svelte, Vue and Nuxt each forbid it. Full table: [ssr.md](ssr.md).
- **Ambient string-API tags must be imported in both bundles.** One import registers the grammar per
  bundle, and an SSR app has two. See [rich-text.md](rich-text.md).

## Rich text

- **`<T>` maps only the tags you give it.** A tag with no mapping falls back to its inner text. There
  is no HTML passthrough, by design — there is no HTML sink anywhere in the render path.
- **`t()` does not parse tags unless `@comvi/core/tags` is imported**, and that import is
  process-wide and retroactive, with no per-instance opt-out.

## Platform features

- **The in-context editor needs a Comvi account.** `@comvi/plugin-in-context-editor` requires the
  [Comvi platform](https://comvi.io) and does not work standalone. Its production entry is a no-op
  installer, so a production build that composes it carries no editor bytes.
- **The browser extension must be 0.5.0 or newer.** `window.__COMVI__` is protocol v2, and an older
  extension does not speak it. Discovery is opt-in either way: `.use(devtools())`. See
  [MIGRATION.md](../../MIGRATION.md).
- **`cdnLoader` reads a public distribution only.** Draft translations, private projects and
  auth-gated content need API mode: `fetchLoader` from the package root plus an `apiKey` on the
  host. The root entry carries the API request path in the bundle either way, which is why the
  CDN-only subpath exists.

## Tooling

- **The 0.4 → 0.5 codemod is repo-internal.** `pnpm codemod:framework-slim` runs from a checkout of
  this repository; there is no published binary. See [MIGRATION.md](../../MIGRATION.md#3-the-codemod).
- **The codemod cannot rewrite Vue or Svelte template markup.** It flags `<T raw>` in those files
  for a by-hand rename instead of rewriting it.
- **Typed keys are generated, not inferred.** `TranslationKeys` is a declaration-merging interface;
  `@comvi/cli` (from the platform) or `@comvi/vite-plugin` (from local JSON) writes it. Nothing
  infers key types from a runtime catalog.

## Deprecated surface, and when it goes

Four members on `useI18n()` are declared as optional `never` in react, solid, svelte and vue, so
`if (bag.reloadTranslations)` compiles and is always false. Acquire them from `useI18nLoader()` /
`useI18nPlugins()` instead. Those declarations, `<T raw>`, `allowedTags?: never` on svelte's `<T>`, and
`ssrInitialLocale` on `@comvi/react` are all **removed in 0.6**.

## Environment

- **Node 20 or newer** for the runtime packages; **Node 22 or newer** for `@comvi/cli` and
  `@comvi/vite-plugin`. Exact ranges are each package's `engines` field.
- **Peer ranges** are each package's `peerDependencies` field, and the install line in each README
  quotes it. Svelte is `^5.3.0` — Svelte 4 is not supported, because the bindings use runes.
- **No `eval` and no `new Function`** in any runtime package, so every package runs under a strict
  CSP without `unsafe-eval`. This is a gate, not a claim: a dist test asserts it.

## Not on the roadmap

Listed so nobody waits for them: an ICU format grammar (see above), a runtime
translation-memory/fuzzy-match layer, and automatic key extraction from source. Key extraction is
the platform's job, not the library's.

## Related

- [Composition](composition.md) · [ICU](icu.md) · [Rich text](rich-text.md) ·
  [Formatting](formatting.md) · [SSR](ssr.md) · [Next.js runtimes](next-runtimes.md)
