// Framework size fixture (plan P0.7): the nuxt SERVER graph under the
// `hostModule` recipe (plan P4 step 5) — a slim+attachLoader host handed to
// vue's `createI18nFromCore`. The root-importing runtime plugin module is
// deliberately absent: with `hostModule` set, the build-time template emits
// the composed-host branch instead, and that is the byte difference P4 gates.
// PENDING until Phase 4 lands `createI18nFromCore` + the template branch.
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { createI18nFromCore } from "@comvi/vue";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { loadTranslations } from "@comvi/nuxt/runtime/server/utils/loadTranslations.js";

const i18n = createI18nFromCore(
  attachLoader(
    createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello, {name}!" } },
    }),
  ),
  { locale: "en" },
);

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, loadTranslations);
