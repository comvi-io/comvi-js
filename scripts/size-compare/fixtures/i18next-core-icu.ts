import i18next from "i18next";
import ICU from "i18next-icu";
void i18next.use(ICU).init({
  lng: "en",
  resources: { en: { translation: { items: "{count, plural, one {# item} other {# items}}" } } },
});
console.log(i18next.t("items", { count: 2 }));
