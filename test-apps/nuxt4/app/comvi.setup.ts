import type { VueI18n } from "@comvi/vue";

type ComviSetupContext = {
  i18n: VueI18n;
};

export default ({ i18n }: ComviSetupContext) => {
  i18n.registerLoader({
    en: () => import("./locales/en.json"),
    de: () => import("./locales/de.json"),
    fr: () => import("./locales/fr.json"),
    es: () => import("./locales/es.json"),
    uk: () => import("./locales/uk.json"),
    ar: () => import("./locales/ar.json"),
    "en:admin": () => import("./locales/admin/en.json"),
    "de:admin": () => import("./locales/admin/de.json"),
    "fr:admin": () => import("./locales/admin/fr.json"),
    "es:admin": () => import("./locales/admin/es.json"),
    "uk:admin": () => import("./locales/admin/uk.json"),
    "ar:admin": () => import("./locales/admin/ar.json"),
  });
};
