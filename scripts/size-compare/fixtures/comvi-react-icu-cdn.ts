import { createI18n, I18nProvider, useI18n } from "@comvi/react";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);
void i18n
  .init()
  .then(() => console.log(i18n.t("items" as never, { count: 2 } as never), I18nProvider, useI18n));
