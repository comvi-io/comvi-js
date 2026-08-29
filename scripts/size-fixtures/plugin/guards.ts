// Informational: the smallest graph carrying the plugins-only NESTED-USE
// guard — a hand-written installer shaped exactly like the three lowercase
// plugin-package installers: `ensureInstallable` first, then the ensure-step,
// then route into the host's own `use`.
//
// Measured against `plugin-guards-baseline` — the same graph without the
// guard reference — the delta is what `ensureInstallable` costs a plugin
// package. It is deliberately measured on a hand-written installer rather than
// through a plugin package, so the number is the guard and not the plugin.
import { createI18n } from "@comvi/core";
import { attachPlugins, ensureInstallable } from "@comvi/core/plugins";

const i18n = attachPlugins(ensureInstallable(createI18n({ locale: "en" }), "myInstaller"));
i18n.use(() => undefined);

console.log(i18n.t("hello" as never));
