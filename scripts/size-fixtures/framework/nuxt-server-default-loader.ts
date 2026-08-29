// Framework size fixture: the nuxt SERVER graph — the runtime plugin, the `useI18n`
// composable and the server translation loader — on a `hostModule` host that composed
// the ONE capability SSR needs.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { loadTranslations } from "@comvi/nuxt/runtime/server/utils/loadTranslations.js";
import { createI18n } from "@comvi/core";
import { loader } from "@comvi/core/loader";
import { createI18nFromCore } from "@comvi/vue";

// The user's hostModule default export, inlined: nuxt hands it the resolved
// options and it returns a FRESH composed host per call.
const host = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
}).with(loader());

// Template hostModule branch: `createComviI18n` wraps the host for the app,
// `createComviCore` hands the same shape to the server utilities.
const i18n = createI18nFromCore(host, { ssrLocale: "en" });

console.log(
  plugin,
  useI18n,
  loadTranslations,
  i18n.t("greeting" as never, { name: "world" } as never),
  host.getLoader(),
);
