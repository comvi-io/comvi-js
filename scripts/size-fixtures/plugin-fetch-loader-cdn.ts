// Size-gate fixture: THE PLATFORM CDN PATH — the base host, the ICU compiler and
// the fetch loader, composed exactly as the @comvi/plugin-fetch-loader README
// quickstart does.
import { createI18n } from "@comvi/core";
import { icu } from "@comvi/core/icu";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" })
  .with(icu())
  .with(fetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

// Observable use keeps the loader and core graphs live for the bundler.
void i18n.init().then(() => console.log(i18n.t("items" as never, { count: 2 } as never)));
