// Framework size fixture: the UPPER BOUND of a nuxt app's comvi graph — the same
// runtime plugin, `useI18n` composable and server translation loader as the other two
// nuxt rows, on a `hostModule` host that composed EVERY capability: ICU, loader, plugin
// host and devtools discovery.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { loadTranslations } from "@comvi/nuxt/runtime/server/utils/loadTranslations.js";
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";
import { createI18nFromCore } from "@comvi/vue";

// The user's hostModule default export, inlined. Loader and plugin host exist
// before the catalog is ingested; discovery attaches last.
const host = createI18n({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
host.addTranslations({ en: { greeting: "Hello, {name}!" } });
host.with(devtools({ exposeGlobal: false }));

const i18n = createI18nFromCore(host, { ssrLocale: "en" });

console.log(
  plugin,
  useI18n,
  loadTranslations,
  i18n.t("greeting" as never, { name: "world" } as never),
  host.getLoader(),
  host.getPluginData("any"),
  host.instanceId,
);
