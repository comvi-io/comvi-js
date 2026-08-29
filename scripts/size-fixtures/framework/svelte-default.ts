// Framework size fixture (single-entry P3): THE DEFAULT svelte app. One
// specifier — `@comvi/svelte` — supplies the host constructor and the
// bindings, and the app uses no capability at all. This is the floor of the
// svelte ladder and the row every other svelte row is read against.
//
// RETARGETED from `svelte-slim-preset.ts`, whose specifier was
// `@comvi/svelte/slim`. That subpath is gone: the single-package toolkit IS the
// published root now, so the quickstart shape it measured is simply the default
// shape, and this file measures it through the one entry that ships. It also
// ABSORBS the two-package `svelte-slim.ts`, which built the identical graph
// while naming `@comvi/core` for its constructor — the root carries that
// constructor, so the two fixtures had become one graph reached through two
// specifiers.
//
// The whole capability toolkit the root re-exports (icu/icuCompiler, loader,
// plugins, devtools and their `attach*` siblings) is UNUSED here and is
// sentinel-asserted ABSENT from the module graph — four core subpath entries
// plus core's tag-registration pair. That absence is the single-entry claim
// stated as a gate: merging the toolkit into the root must cost an app that
// calls none of it exactly nothing.
//
// Core's BASE entry is deliberately NOT a sentinel and cannot be: `createI18n`
// re-exported from `@comvi/core` is what this app constructs with, so
// comvi-core.js is in this graph by construction. `svelte` is external, so this
// measures the comvi graph only (dist/T.svelte is compiled by the size gate the
// way a consumer's svelte plugin compiles it).
import { createI18n, setI18nContext, useI18n } from "@comvi/svelte";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n);
