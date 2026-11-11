// Framework size fixture: `@comvi/nuxt/i18n` as a `comvi.i18n.ts` names it — the options
// factory and the CDN loader.
import { cdn, defineI18nOptions } from "@comvi/nuxt/i18n";

export default defineI18nOptions(() => ({ loader: cdn("https://cdn.comvi.io/token") }));
