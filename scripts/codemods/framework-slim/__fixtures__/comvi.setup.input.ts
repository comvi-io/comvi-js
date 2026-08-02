// Report-only — nuxt's `comvi.setup` hook receives a VueI18n in the app
// plugin, so its dropped-proxy calls are candidates for `i18n.core.*` (§6.2).
// The receiver's type is still textually undecidable, so nothing is rewritten.
import type { NuxtI18nSetup } from "@comvi/nuxt";

export default (({ i18n }) => {
  i18n.registerLoader(async () => ({}));
  i18n.core.onLoadError(() => {});
}) satisfies NuxtI18nSetup;
