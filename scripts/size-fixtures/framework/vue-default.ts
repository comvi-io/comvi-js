// Framework size fixture (single-entry P3): THE DEFAULT vue app. One
// specifier — `@comvi/vue` — supplies the host constructor and the bindings,
// and the app uses no capability at all. This is the floor of the vue ladder
// and the row every other vue row is read against.
//
// RETARGETED from `vue-slim-preset.ts`, whose specifier was `@comvi/vue/slim`.
// That subpath is gone: the single-package toolkit IS the published root now,
// so the quickstart shape it measured is simply the default shape, and this
// file measures it through the one entry that ships.
//
// This row carries the wave's only PRESET GLUE: vue is the one binding whose
// `createI18n` is a real function rather than a rename of core's constructor,
// because there is a `VueI18n` to build and `ssrLocale` to apply before the
// reactive ref is seeded. `vue-default-composed.ts` measures the same wrapper
// through `createCore` + `createI18nFromCore`, so the delta between the two
// rows IS that glue, still measured rather than claimed.
//
// The whole capability toolkit the root re-exports (icu, icuCompiler, loader,
// plugins, devtools and their `attach*` siblings) is UNUSED here and is
// sentinel-asserted ABSENT from the module graph — four core subpath entries
// plus core's tag-registration pair. That absence is the single-entry claim
// stated as a gate: merging the toolkit into the root must cost an app that
// calls none of it exactly nothing.
//
// Core's BASE entry is deliberately NOT a sentinel and cannot be: the preset
// constructs on it, so comvi-core.js is in this graph by construction. `vue`
// is external, so this measures the comvi graph only.
import { createI18n, useI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
  ssrLocale: "en",
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
