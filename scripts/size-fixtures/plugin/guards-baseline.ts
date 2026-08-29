// Informational BASELINE: the plugin host alone — `@comvi/core/plugins` composed onto
// the base host, one plugin registered, and NO reference to `ensureInstallable`.
import { createI18n } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";

const i18n = createI18n({ locale: "en" }).with(attachPlugins);
i18n.use(() => undefined);

console.log(i18n.t("hello" as never));
