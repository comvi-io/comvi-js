// Informational: the lowercase `.with(localeDetector(…))` installer — the documented
// one-call recipe for this package.
import { createI18n } from "@comvi/core";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).with(localeDetector({ supportedLocales: ["en", "uk"] }));

console.log(i18n.t("hello" as never));
