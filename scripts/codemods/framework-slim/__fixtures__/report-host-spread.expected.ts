// Report-only — spreads, computed options and interpolated catalogs are opaque.
import { createI18n } from "@comvi/react";
import { catalogs, hostOptions, optionName, suffix } from "./options";

export const spreadOptions = createI18n({ locale: "en", ...hostOptions });
export const computedOption = createI18n({ locale: "en", [optionName]: false });
export const spreadCatalog = createI18n({
  locale: "en",
  translation: { en: { ...catalogs } },
});
export const dynamicTemplate = createI18n({
  locale: "en",
  translation: { en: { message: `Hello ${suffix}, {count, plural, one {x} other {y}}` } },
});
