// Framework size fixture (plan P0.7 / §4.5): the nuxt CLIENT graph under the
// `hostModule` recipe — the runtime plugin and the `useI18n` composable on a
// bare-slim host (no server loader, no loader capability): the server loads
// and serializes, the client pays the bare-slim price. Budgeted from measured
// when it graduates, but NOT S-gated: its savings class is the one vue's own
// gate proves (plan P4 checkpoint).
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { createI18n } from "@comvi/core";
import { createI18nFromCore } from "@comvi/vue/slim";

const i18n = createI18nFromCore(createI18n({ locale: "en" }), { ssrLocale: "en" });

// Hydration path: the SSR-serialized catalog arrives as plain data.
i18n.addTranslations({ en: { greeting: "Hello, {name}!" } } as never);

console.log(plugin, useI18n, i18n.t("greeting" as never, { name: "world" } as never));
