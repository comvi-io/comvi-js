// Framework size fixture (single-entry P3): THE DEFAULT solid app. One
// specifier — `@comvi/solid` — supplies the host constructor and the bindings,
// and the app uses no capability at all. This is the floor of the solid ladder
// and the row every other solid row is read against.
//
// RETARGETED from `solid-slim-preset.ts`, whose specifier was
// `@comvi/solid/slim`. That subpath is gone: the single-package toolkit IS the
// published root now, so the quickstart shape it measured is simply the
// default shape, and this file measures it through the one entry that ships.
// It also absorbs the deleted `solid-slim.ts`, whose app reached into
// `@comvi/core` for the same constructor the root now carries.
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
// comvi-core.js is in this graph by construction. `solid-js` is external, so
// this measures the comvi graph only.
import { createI18n, I18nProvider, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

// Observable use keeps the wrapper + core graphs live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
