// Same message text as i18next-core-icu.ts without the i18next-icu plugin: isolates what
// i18next-icu plus intl-messageformat add to i18next.
import i18next from "i18next";
void i18next.init({
  lng: "en",
  resources: { en: { translation: { items: "{count, plural, one {# item} other {# items}}" } } },
});
console.log(i18next.t("items", { count: 2 }));
