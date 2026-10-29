import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n, handover } from "@comvi/vue";
import { App, options } from "./app";

/**
 * One request: an instance and an app of its own; the route's namespaces loaded first. A
 * namespace that has no catalog of the locale (`legal` in `uk`) rejects its `load()` and
 * renders through the fallback chain; the render goes on.
 */
export async function render(locale: string, cdnBase: string) {
  const i18n = createI18n({ ...options(cdnBase), locale });
  const ok = () => {};
  await Promise.all([
    i18n.load("account").catch(ok),
    i18n.load("legal").catch(ok),
    // Read by `<T ns="promo">` alone: preloaded, held by nothing.
    i18n.load("promo").catch(ok),
    i18n.ready,
  ]);
  const html = await renderToString(createSSRApp(App).use(i18n));
  return { html, payload: handover(i18n) };
}
