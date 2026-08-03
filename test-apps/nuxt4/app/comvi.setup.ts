import type { VueI18n } from "@comvi/vue";
import type { I18n } from "@comvi/core";
import { createImportMapLoader, type I18nLoaderApi } from "@comvi/core/loader";

// The host this hook DEMANDS: since the single-entry convergence `I18n` is the
// base host, so a setup hook that registers a loader has to say that its host
// carries the loader capability. The Nuxt module's generated host template
// composes it (P4 flips the default template to the base host + explicit
// composition); until then this annotation is what keeps the requirement
// visible instead of failing at the first `registerLoader` call.
type ComviSetupContext = {
  i18n: VueI18n<{}, I18n & I18nLoaderApi>;
};

export default ({ i18n }: ComviSetupContext) => {
  // The import-map form is the adapter's job now: the loader capability's own
  // `registerLoader` takes a `LoaderFn`, and `createImportMapLoader` turns a
  // static map into one (reading the default namespace live off the host).
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
