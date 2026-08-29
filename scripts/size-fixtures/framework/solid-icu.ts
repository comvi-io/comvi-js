// Framework size fixture (single-entry P3): the default solid app with ICU
// message formatting, still through ONE specifier. `icuCompiler` comes from
// `@comvi/solid` — the same package as the constructor and the bindings — which
// is the whole point of the single-entry surface: reaching a capability never
// means reaching past your framework package.
//
// NEW row in P3, the solid twin of `fw-react-icu`. It exists because the root
// now re-exports the toolkit: an app that opts into exactly one capability must
// pay for exactly that one, and no row before this one measured that shape for
// solid.
//
// INLINE catalogs take the CONSTRUCTOR OPTION, as here — the compiler is in
// place before the translation passed to `createI18n` is ingested. The
// installer form (`.with(icu())`) is for REMOTE catalogs, where it must run
// before ingestion too; core's `core-base-icu` / `core-base-icu-installer`
// pair is where that delta is measured, and it is not re-measured per wrapper.
//
// SENTINELS assert the capabilities this app does NOT buy: core's
// tag-registration pair (no <T> here, so tag syntax must stay out of the
// graph) plus the loader, plugins and devtools subpath entries. The ICU entry
// is deliberately NOT a sentinel — it is what the row buys, present by
// construction, since `icuCompiler` is the compiler this host formats with.
// The bundler-matrix `solid-icu` case is where that presence is proved
// positively: it runs the bundle and asserts a plural actually formats.
import { createI18n, I18nProvider, icuCompiler, useI18n } from "@comvi/solid";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never), I18nProvider, useI18n);
