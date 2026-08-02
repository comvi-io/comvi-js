// Framework size fixture (plan P0.1/P0.7): the nuxt RUNTIME graph on the
// DEFAULT (root) branch — the runtime plugin, the `useI18n` composable, the
// server translation loader, and the construction the generated
// `#build/comvi.host` template performs when `hostModule` is unset.
//
// The template is a nuxt virtual module (external here, like #app), so the
// fixture carries its two imports itself: that build-time branch is exactly
// what P4's nuxt gate measures, and leaving it out would measure a nuxt app
// with no i18n core at all. Nuxt virtual modules and `vue` are external: this
// measures the comvi graph only.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { loadTranslations } from "@comvi/nuxt/runtime/server/utils/loadTranslations.js";
import { createI18n as createVueI18n } from "@comvi/vue";
import { createI18n as createCore } from "@comvi/core";

// Template root branch: `createComviI18n` (client/plugin) and
// `createComviCore` (per-request server instance).
const i18n = createVueI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});
const serverCore = createCore({ locale: "en" });

// Observable use keeps the runtime graph live for the bundler.
console.log(
  plugin,
  useI18n,
  loadTranslations,
  i18n.t("greeting" as never, { name: "world" } as never),
  serverCore.locale,
);
