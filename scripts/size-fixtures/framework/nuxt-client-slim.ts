// Framework size fixture (plan P0.7 / §4.5): the nuxt CLIENT graph under the
// `hostModule` recipe — the server loads and serializes, the client pays the
// bare-slim price. Budgeted from measured when it graduates, but NOT S-gated:
// its savings class is the one vue's own gate proves (plan P4 checkpoint).
// PENDING until Phase 4 lands `createI18nFromCore` + the template branch.
import { createI18n } from "@comvi/core/slim";
import { createI18nFromCore } from "@comvi/vue";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";

const i18n = createI18nFromCore(createI18n({ locale: "en" }), { locale: "en" });

// Hydration path: the SSR-serialized catalog arrives as plain data.
i18n.addTranslations("en", { greeting: "Hello, {name}!" } as never);

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
