// Framework size fixture (single-entry P4): the nuxt SERVER graph — the
// runtime plugin, the `useI18n` composable and the server translation loader —
// on a `hostModule` host that composed the ONE capability SSR needs.
//
// RENAMED from `nuxt-server-slim-loader.ts`. The recipe is unchanged; the word
// that named it is gone, because there is no second host tier to be slim
// against. What the row measures is the default nuxt server graph plus
// `@comvi/core/loader`, and the module never adds that for you: SSR loading is
// a capability an app composes in its own factory.
//
// This row and `fw-nuxt-client-default` are the same runtime modules and the
// same base host; they differ in the server utilities and in the one composed
// capability. `fw-nuxt-full-composite` is the same graph again with every
// capability composed — three rows, one construction seam, which is what makes
// the ladder readable.
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
