// Framework size fixture (single-entry P4): the default Next.js CLIENT bundle
// with ICU message formatting, still through ONE specifier. `icuCompiler` comes
// from `@comvi/next/client` — the same entry as the constructor, the provider
// and the hooks.
//
// NEW row in P4, the client half of P4's ICU acceptance gate. It exists because
// a next client app that opts into exactly one capability must pay for exactly
// that one, and no row before this measured that shape for next.
//
// INLINE catalogs take the CONSTRUCTOR OPTION, as here — the compiler is in
// place before the translation passed to `createI18n` is ingested. The
// installer form (`.with(icu())`) is for catalogs that arrive later (a client
// host is hydrated, so that is the shape a hydrating app uses) and it must run
// before ingestion too; core's `core-base-icu` / `core-base-icu-installer` pair
// is where that delta is measured, and it is not re-measured per wrapper.
//
// SENTINELS assert the capabilities this app does NOT buy: core's
// tag-registration pair (no `<T>` here) plus the loader, plugins and devtools
// subpath entries. The ICU entry is deliberately NOT a sentinel — it is what
// the row buys, present by construction. The bundler-matrix `next-client-icu`
// case is where that presence is proved positively: it runs the bundle and
// formats a plural for real.
import { createI18n, I18nProvider, icuCompiler, useI18n } from "@comvi/next/client";

const i18n = createI18n({
  locale: "en",
  translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
  compiler: icuCompiler,
} as never);

console.log(i18n.t("items" as never, { count: 2 } as never), I18nProvider, useI18n);
