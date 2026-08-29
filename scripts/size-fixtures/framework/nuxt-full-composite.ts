// Framework size fixture (single-entry P4): the UPPER BOUND of a nuxt app's
// comvi graph — the same runtime plugin, `useI18n` composable and server
// translation loader as the other two nuxt rows, on a `hostModule` host that
// composed EVERY capability: ICU, loader, plugin host and devtools discovery.
//
// RE-ANCHORED from `fw-nuxt-root`, which measured the pre-convergence DEFAULT
// branch back when constructing through `@comvi/vue` dragged a composed core
// in whether the app used it or not. This row is NOT behavior-identical to
// that historical default: 0.4 also registered string-API tag syntax
// ambiently, and convergence makes that an explicit `@comvi/core/tags` import
// no nuxt graph performs for you. It is the capability upper bound, not a
// restoration.
//
// PARITY ORDERING, inherited from `core-full-composite.ts`: loader and plugin
// host installed FIRST, so the loader's nested-catalog flattener is present
// when the catalog is ingested, and devtools discovery LAST, so `instanceId`
// stays the final public own property. ICU takes the constructor option
// because `.with(icu())` is pre-ingestion only and this host ingests at
// construction.
//
// `<T>` is deliberately NOT in this row. All three nuxt rows are the same
// runtime modules differing only in the composed capabilities, which is what
// makes their differences readable as capability cost; the rich-text seam is
// measured on the vue ladder, whose component nuxt re-exports verbatim. The
// tag-registration pair is sentinel-asserted absent for the same reason it is
// on `fw-react-full-composite`: ambient string-API tags are the deliberate
// explicit-import residual.
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
