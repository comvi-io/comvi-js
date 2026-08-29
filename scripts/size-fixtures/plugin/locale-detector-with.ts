// Informational: the lowercase `.with(localeDetector(…))` installer — the
// documented one-call recipe for this package.
//
// Measured against `plugin-locale-detector-use`, which composes the same
// capability by hand and registers the same uppercase plugin, the delta is the
// installer function plus the plugins-only nested-use guard it calls as its
// first ensure-step.
import { createI18n } from "@comvi/core";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).with(localeDetector({ supportedLocales: ["en", "uk"] }));

console.log(i18n.t("hello" as never));
