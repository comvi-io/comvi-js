// core + ICU (R3-10 ceiling 3,250): createI18n and t() with a plain {name} and a
// plural — the instance with everything it always carries (state, loading, fallback
// chain, defaultParams, per-call ns/locale, has, destroy, onError codes).
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  messages: {
    en: { hi: "Hello, {name}!", items: "{count, plural, one {# item} other {# items}}" },
  },
});
export const out = [i18n.t("hi", { name: "Ann" }), i18n.t("items", { count: 2 })];
