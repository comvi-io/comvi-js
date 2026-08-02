// Framework size fixture (plan P0.1/P0.7): the nuxt RUNTIME graph as it exists
// today — the runtime plugin (which constructs the root core through
// @comvi/vue's `createI18n`), the `useI18n` composable, and the server
// translation loader. This is the comparison base for P4's nuxt server-graph
// gate. Nuxt virtual modules (#app, #build/*) and `vue` are external: this
// measures the comvi graph only.
import plugin from "@comvi/nuxt/runtime/plugin.js";
import { useI18n } from "@comvi/nuxt/runtime/composables/useI18n.js";
import { loadTranslations } from "@comvi/nuxt/runtime/server/utils/loadTranslations.js";

// Observable use keeps the runtime graph live for the bundler.
console.log(plugin, useI18n, loadTranslations);
