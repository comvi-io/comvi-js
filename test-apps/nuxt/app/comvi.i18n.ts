import { defineI18nOptions, type Plugin } from "@comvi/nuxt/i18n";
import { probe } from "./probe";

/**
 * The e2e's count of server instances (lot 7 lifecycle): every instance runs this plugin;
 * `destroy()` runs its teardown. On a server only; the browser counts nothing.
 */
const lifecycle: Plugin = {
  name: "e2e-lifecycle",
  setup: () => {
    if (typeof window !== "undefined") return;
    probe.created++;
    return () => void probe.destroyed++;
  },
};

// ONE loader for the server render, the browser and Nitro routes. On a server `event` is
// the request: its `$fetch` forwards the user's cookies and calls the app's route
// in-process. In the browser `event` is undefined and the global `$fetch` sends them.
// `retry: 0`: one attempt; a retry is `i18n.load(ns)`. The `x-comvi-catalog` header marks
// the catalog request: if it ever reaches no route, the module answers it 404 instead of
// rendering a page whose loader would ask again. The e2e turns the whole catalog route into
// a missing one (cookie `e2e-missing=api` or `=out`, which the server's sub-requests forward).
const url = (locale: string, ns: string, missing?: string) =>
  missing === "api"
    ? `/api/nowhere/${locale}/${ns}`
    : missing === "out"
      ? `/elsewhere/${locale}/${ns}`
      : `/api/i18n/${locale}/${ns}`;

export default defineI18nOptions((event) => {
  const fetch = event?.$fetch ?? $fetch;
  const missing = event?.headers.get("cookie")?.match(/e2e-missing=(api|out)/)?.[1];
  return {
    loader: (locale, ns, signal) => {
      if (typeof window === "undefined")
        signal.addEventListener("abort", () => void probe.aborted++);
      return fetch(url(locale, ns, missing), {
        signal,
        retry: 0,
        headers: { "x-comvi-catalog": "1" },
      });
    },
    plugins: [lifecycle],
  };
});
