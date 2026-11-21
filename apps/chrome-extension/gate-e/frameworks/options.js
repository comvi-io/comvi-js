// The instance options every framework row shares: the real `cdn()` loader of @comvi/core
// against the mock platform's published catalogs, and `devtools()` so the extension finds the
// instance. Nothing else: no detection, no persistence, nothing the rows do not check.
import { cdn } from "@comvi/core/cdn";
import { devtools } from "@comvi/core/devtools";

export const options = () => ({
  locale: "en",
  fallbackLocale: "en",
  namespaces: ["default", "common"],
  loader: cdn(`${location.origin}/cdn`),
  plugins: [devtools()],
});

/** Called once the first render is on the page: the helpers in site.ts wait for it. */
export function booted() {
  document.body.dataset.booted = "true";
}
