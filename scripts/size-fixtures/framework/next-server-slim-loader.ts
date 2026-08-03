// Framework size fixture (plan P0.7, retargeted by the framework-slim DX
// pass, retargeted again by DX-2): the next SERVER graph on a composed slim
// host — SSR without ICU/tags, exactly the configuration Phase 7 shipped for
// core.
//
// Every specifier is `@comvi/next/server`: the host constructor and the
// capability toolkit are re-exported there, so an SSR next app never names
// `@comvi/core`. The measured recipe is the documented recipe, so composition
// goes through the DX-2 pipe — and through `.with(attachLoader)`, not
// `.with(loader())`, because this host registers NO import map. `loader()`
// statically references the import-map adapter, which is +111 B min+gz on
// this graph; `attachLoader` is the installer for a host that will register a
// plain `LoaderFn` (or, as here, none at all) and costs 2 B over calling it
// directly. Every root-importing module — and every capability subpath this
// recipe does not use — must still tree-shake out.
import {
  attachLoader,
  createNextI18nFromHost,
  createSlimI18n,
  getI18n,
  loadTranslations,
  setRequestLocale,
} from "@comvi/next/server";

const { i18n, routing } = createNextI18nFromHost(
  () =>
    createSlimI18n({
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
