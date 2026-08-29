// Informational BASELINE: the uppercase `LocaleDetector` plugin on a host the app
// composed itself.
import { createI18n } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).with(attachPlugins);
i18n.use(LocaleDetector({ supportedLocales: ["en", "uk"] }));

console.log(i18n.t("hello" as never));
