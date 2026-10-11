// Size-gate fixture: THE API-AWARE PATH — the base host, the ICU compiler and
// `fetchLoader` from `@comvi/plugin-fetch-loader/api`, composed as the
// @comvi/plugin-fetch-loader README API recipe does.
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { fetchLoader } from "@comvi/plugin-fetch-loader/api";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(
  // Stale placeholder on purpose: this literal is measured, and no reader sees a fixture.
  fetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

// Observable use keeps the loader and core graphs live for the bundler.
void i18n.init().then(() => console.log(i18n.t("items" as never, { count: 2 } as never)));
