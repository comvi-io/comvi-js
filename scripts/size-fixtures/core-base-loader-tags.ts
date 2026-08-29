// Composed-additivity fixture: base host + loader + plugins + tags, measured as an
// ACTUAL composed graph — never derived by summing the per-capability deltas.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";
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
