import type { VueI18n } from "@comvi/vue";
import type { I18n } from "@comvi/core";
import { createImportMapLoader, type I18nLoaderApi } from "@comvi/core/loader";

// `I18n` is the base host, so a setup hook that registers a loader must say its
// host carries the loader capability — `comvi.host.ts` is where it is composed.
type ComviSetupContext = {
  i18n: VueI18n<{}, I18n & I18nLoaderApi>;
};

export default ({ i18n }: ComviSetupContext) => {
  // `registerLoader` takes a `LoaderFn`; `createImportMapLoader` turns a static
  // map into one, reading the default namespace live off the host.
  i18n.core.registerLoader(
    createImportMapLoader(
      {
        en: () => import("../../locales/en.json"),
        de: () => import("../../locales/de.json"),
        fr: () => import("../../locales/fr.json"),
        es: () => import("../../locales/es.json"),
        uk: () => import("../../locales/uk.json"),
        ar: () => import("../../locales/ar.json"),
        "en:admin": () => import("../../locales/admin/en.json"),
        "de:admin": () => import("../../locales/admin/de.json"),
        "fr:admin": () => import("../../locales/admin/fr.json"),
        "es:admin": () => import("../../locales/admin/es.json"),
        "uk:admin": () => import("../../locales/admin/uk.json"),
        "ar:admin": () => import("../../locales/admin/ar.json"),
      },
      () => i18n.core.getDefaultNamespace(),
    ),
  );
};
