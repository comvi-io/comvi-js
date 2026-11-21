import { defineRouting } from "@comvi/next/routing";

export const routing = defineRouting({
  locales: ["en", "de"],
  defaultLocale: "en",
  // Every page carries its locale: the mock server proxies `/en/…` and `/de/…` to this app.
  localePrefix: "always",
});

/** The mock platform's published catalogs, read with the real cdn() loader on both sides. */
export const CDN = "http://127.0.0.1:8791/cdn";
export const NAMESPACES = ["default", "common"];
