import { createI18n, type Loader } from "@comvi/vue";
import { detect, persist } from "@comvi/core/plugins";

const supportedLocales = ["en", "de", "fr", "es", "uk", "ar"] as const;

// One dynamic import per catalog: a locale or a namespace is downloaded when it is needed.
// `locale:namespace` entries belong to a namespace a view loads with useI18n("admin").
const bundled = {
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
};

const loader: Loader = async (locale, ns) => {
  const load = bundled[(ns === "default" ? locale : `${locale}:${ns}`) as keyof typeof bundled];
  if (!load) throw new Error(`No bundled catalog for ${locale}/${ns}`);
  return (await load()).default;
};

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader,
  // The visitor's last choice in localStorage, then the browser; written back on every switch.
  plugins: [
    detect({ supported: [...supportedLocales], order: ["storage", "navigator"] }),
    persist({ to: "storage" }),
  ],
});
