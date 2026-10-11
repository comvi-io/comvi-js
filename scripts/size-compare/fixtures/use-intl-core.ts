import { createTranslator } from "use-intl/core";
const t = createTranslator({
  locale: "en",
  messages: { items: "{count, plural, one {# item} other {# items}}" },
});
console.log(t("items", { count: 2 }));
