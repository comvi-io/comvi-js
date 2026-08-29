// Framework size fixture: THE DEFAULT nuxt CLIENT graph — the runtime plugin and the
// `useI18n` composable on the host the generated `#build/comvi.host` template builds
// when `hostModule` is unset.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { createI18n } from "@comvi/vue";

// Template default branch, client half: `createComviI18n`.
const i18n = createI18n({ locale: "en", ssrLocale: "en" });

// Hydration path: the SSR-serialized catalog arrives as plain data.
i18n.addTranslations({ en: { greeting: "Hello, {name}!" } } as never);

console.log(plugin, useI18n, i18n.t("greeting" as never, { name: "world" } as never));
