// Composed-additivity fixture (plan P0.9): slim + loader + plugins + tags —
// the "loader (+plugins) + <T>" rung of the §2.1 ladder. Measured as an ACTUAL
// composed graph; the row is never derived by summing per-entry deltas.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";

const i18n = attachPlugins(
  attachLoader(
    createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello, <b>{name}</b>!" } },
    }),
  ),
);

i18n.registerLoader(async () => ({ greeting: "Hello, <b>{name}</b>!" }));

console.log(i18n.t("greeting" as never, { name: "world" } as never));
