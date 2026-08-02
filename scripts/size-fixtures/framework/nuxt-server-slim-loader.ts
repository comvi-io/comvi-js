// Framework size fixture (plan P0.7): the nuxt SERVER graph under the
// `hostModule` recipe (plan P4 step 5) — the same runtime plugin, composable
// and server loader as fw-nuxt-root, but with the construction the generated
// `#build/comvi.host` template performs when `hostModule` IS set: the app's
// own `attachLoader(createI18n(...))` host handed to vue's
// `createI18nFromCore`, and returned as-is to the server utilities.
//
// The two nuxt fixtures differ in exactly that branch, which is what the P4
// nuxt gate measures. (The runtime plugin ships in BOTH configurations — it no
// longer constructs anything itself, so it is not the thing the option
// replaces.)
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { loadTranslations } from "@comvi/nuxt/runtime/server/utils/loadTranslations.js";
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { createI18nFromCore } from "@comvi/vue/slim";

// The user's hostModule default export, inlined.
const host = attachLoader(
  createI18n({
    locale: "en",
    translation: { en: { greeting: "Hello, {name}!" } },
  }),
);

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
