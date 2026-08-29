// Framework size fixture (plan P0.7, retargeted by the framework-slim DX pass,
// again by DX-2, and renamed by single-entry P4): the next SERVER graph on a
// composed BASE host — SSR without ICU or tags.
//
// Every specifier is `@comvi/next/server`: the host constructor and the
// capability toolkit are re-exported there, so an SSR next app never names
// `@comvi/core`. After the convergence that constructor is `createI18n`, the
// same base binding the client entry exports; the transitional second name this
// fixture used to call is deleted.
//
// The measured recipe is the documented recipe, so composition goes through the
// DX-2 pipe — and through `.with(attachLoader)`, not `.with(loader())`, because
// this host registers NO import map. `loader()` statically references the
// import-map adapter, which is +111 B min+gz on this graph; `attachLoader` is
// the installer for a host that will register a plain `LoaderFn` (or, as here,
// none at all) and costs 2 B over calling it directly.
//
// What must still tree-shake out: next's own composed builder
// (`createNextI18n.js`), core's tag-registration pair, and every capability
// subpath this recipe does not use. Core's base entry stays — `createI18n` IS
// its export.
import {
  attachLoader,
  createI18n,
  createNextI18nFromHost,
  getI18n,
  loadTranslations,
  setRequestLocale,
} from "@comvi/next/server";

const { i18n, routing } = createNextI18nFromHost(
  () =>
    createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello, {name}!" } },
    }).with(attachLoader),
  { locales: ["en", "de"], defaultLocale: "en" },
);

console.log(
  i18n.t("greeting" as never, { name: "world" } as never),
  routing.defaultLocale,
  getI18n,
  loadTranslations,
  setRequestLocale,
);
