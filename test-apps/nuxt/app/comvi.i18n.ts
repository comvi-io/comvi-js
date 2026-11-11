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
// `retry: 0`: one attempt; a retry is `i18n.load(ns)`.
export default defineI18nOptions((event) => {
  const fetch = event?.$fetch ?? $fetch;
  return {
    loader: (locale, ns, signal) => {
      if (typeof window === "undefined")
        signal.addEventListener("abort", () => void probe.aborted++);
      return fetch(`/api/i18n/${locale}/${ns}`, { signal, retry: 0 });
    },
    plugins: [lifecycle],
  };
});
