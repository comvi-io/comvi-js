// Framework size fixture (plan P0.7): the next SERVER graph on a composed
// slim+attachLoader host — SSR without ICU/tags, exactly the configuration
// Phase 7 shipped for core. Imports ONLY `createNextI18nFromHost` from
// `@comvi/next/server` (the fixed companion export, plan P5 step 1), so every
// root-importing module must tree-shake out.
// PENDING until Phase 5 lands packages/next/src/server/createNextI18nFromHost.ts.
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import {
  createNextI18nFromHost,
  getI18n,
  loadTranslations,
  setRequestLocale,
} from "@comvi/next/server";

const { i18n, routing } = createNextI18nFromHost(
  () =>
    attachLoader(
      createI18n({
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
