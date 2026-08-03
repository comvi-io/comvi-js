// Framework size fixture (plan P0.7, retargeted by the framework-slim DX
// pass): the next SERVER graph on a composed slim + attachLoader host — SSR
// without ICU/tags, exactly the configuration Phase 7 shipped for core.
//
// Every specifier is `@comvi/next/server`: the host constructor and the
// capability toolkit are re-exported there, so an SSR next app never names
// `@comvi/core`. The measured recipe is the documented recipe. Every
// root-importing module — and every capability subpath this recipe does not
// use — must still tree-shake out.
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
    attachLoader(
      createSlimI18n({
        locale: "en",
        translation: { en: { greeting: "Hello, {name}!" } },
      }),
    ),
  { locales: ["en", "de"], defaultLocale: "en" },
);

console.log(
  i18n.t("greeting" as never, { name: "world" } as never),
  routing.defaultLocale,
  getI18n,
  loadTranslations,
  setRequestLocale,
);
