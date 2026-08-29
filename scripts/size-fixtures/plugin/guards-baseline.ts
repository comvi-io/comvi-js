// Informational BASELINE: the plugin host alone — `@comvi/core/plugins`
// composed onto the base host, one plugin registered, and NO reference to
// `ensureInstallable`.
//
// Pairs with `plugin-guards`, which is the same graph plus the nested-use
// guard. The delta between the two rows is the guard's whole cost, and it is
// paid only by graphs that name it: plugin packages, never the base host.
//
// The return-shape guard is NOT separable this way — it is a branch inside
// `_beforeInit`, so it rides both rows equally and shows up as movement in
// this row's own number across the wave.
import { createI18n } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";

const i18n = createI18n({ locale: "en" }).with(attachPlugins);
i18n.use(() => undefined);

console.log(i18n.t("hello" as never));
