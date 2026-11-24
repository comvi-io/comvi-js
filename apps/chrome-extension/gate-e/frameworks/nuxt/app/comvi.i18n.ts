import { cdn } from "@comvi/core/cdn";
import { defineI18nOptions, devtools } from "@comvi/nuxt/i18n";

// The real cdn() loader against the mock platform's published catalogs, on the server and in
// the browser, and devtools() so the extension finds the browser instance.
export default defineI18nOptions(() => ({
  loader: cdn("http://127.0.0.1:8791/cdn"),
  plugins: [devtools()],
}));
