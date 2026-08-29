// Informational BASELINE: the uppercase `FetchLoader` plugin on a host the app composed
// itself — the recipe that predates the lowercase installer.
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(attachLoader).with(attachPlugins);
i18n.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/distribution" }));

console.log(i18n.t("hello" as never));
