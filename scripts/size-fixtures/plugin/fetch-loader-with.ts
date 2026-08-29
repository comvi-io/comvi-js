// Informational: the lowercase `.with(fetchLoader(…))` installer — the documented one-
// call recipe for this package.
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(
  fetchLoader({ cdnUrl: "https://cdn.comvi.io/distribution" }),
);

console.log(i18n.t("hello" as never));
