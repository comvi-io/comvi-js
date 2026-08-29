// Informational BASELINE: the uppercase `LocaleDetector` plugin on a host the
// app composed itself. Pairs with `plugin-locale-detector-with`, whose delta
// is the lowercase installer plus its nested-use guard.
//
// Only the plugin host is composed — the detector loads no catalog, so a
// loader would be a capability neither row uses.
import { createI18n } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";
import { LocaleDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).with(attachPlugins);
i18n.use(LocaleDetector({ supportedLocales: ["en", "uk"] }));

console.log(i18n.t("hello" as never));
