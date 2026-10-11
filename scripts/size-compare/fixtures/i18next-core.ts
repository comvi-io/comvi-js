import i18next from "i18next";
void i18next.init({
  lng: "en",
  resources: { en: { translation: { greeting: "Hello, {{name}}!" } } },
});
console.log(i18next.t("greeting", { name: "world" }));
