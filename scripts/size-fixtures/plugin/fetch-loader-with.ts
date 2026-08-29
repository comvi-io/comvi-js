// Informational: the lowercase `.with(fetchLoader(…))` installer — the
// documented one-call recipe for this package.
//
// Measured against `plugin-fetch-loader-use`, which composes the same two
// capabilities by hand and registers the same uppercase plugin, the delta is
// the whole price of the installer: the installer function itself plus the
// plugins-only nested-use guard it calls as its first ensure-step.
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(
  fetchLoader({ cdnUrl: "https://cdn.comvi.io/distribution" }),
);

console.log(i18n.t("hello" as never));
