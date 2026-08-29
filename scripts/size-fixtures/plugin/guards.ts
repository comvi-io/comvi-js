// Informational: the smallest graph carrying the plugins-only NESTED-USE guard — a
// hand-written installer shaped exactly like the three lowercase plugin-package
// installers: `ensureInstallable` first, then the ensure-step, then route into the
// host's own `use`.
import { createI18n } from "@comvi/core";
import { attachPlugins, ensureInstallable } from "@comvi/core/plugins";

const i18n = attachPlugins(ensureInstallable(createI18n({ locale: "en" }), "myInstaller"));
i18n.use(() => undefined);

console.log(i18n.t("hello" as never));
