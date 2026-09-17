// Framework size fixture: THE PLATFORM CDN PATH on React — the wrapper's base
// host, the ICU compiler and the CDN-only loader, composed as the React
// README's "From the Comvi CDN" recipe does.
import { createI18n, I18nProvider, useI18n } from "@comvi/react";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
  // Stale placeholder on purpose: this literal is measured, and no reader sees a fixture.
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

// Observable use keeps the wrapper, loader and core graphs live for the bundler.
void i18n
  .init()
  .then(() => console.log(i18n.t("items" as never, { count: 2 } as never), I18nProvider, useI18n));
