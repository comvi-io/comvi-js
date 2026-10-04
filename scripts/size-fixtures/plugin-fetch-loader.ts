// Size-gate fixture: THE CDN-ONLY PLATFORM PATH — the base host, the ICU
// compiler and `cdnLoader` from the package root, composed exactly as the
// @comvi/plugin-fetch-loader README quickstart does. Its pair is
// `plugin-fetch-loader-api`, the same composition through `/api`, whose
// runtime `if (apiKey)` branch also carries the API request path.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { cdnLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
  // Stale placeholder on purpose: this literal is measured, and no reader sees a fixture.
  cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

// Observable use keeps the loader and core graphs live for the bundler.
void i18n.init().then(() => console.log(i18n.t("items" as never, { count: 2 } as never)));
