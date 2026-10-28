import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n, handover } from "@comvi/vue";
import { App, options } from "./app";

/** One request: an instance and an app of its own; the route's namespaces loaded first. */
export async function render(locale: string, cdnBase: string) {
  const i18n = createI18n({ ...options(cdnBase), locale });
  await Promise.all([i18n.load("account"), i18n.load("legal"), i18n.ready]);
  const html = await renderToString(createSSRApp(App).use(i18n));
  return { html, payload: handover(i18n) };
}
