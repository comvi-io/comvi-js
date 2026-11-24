// The page of the real-platform system test (system-platform.spec.ts): a Comvi 0.8 site that
// reads its catalogs from the platform's Content Deploy output with the REAL `cdn()` loader of
// @comvi/core and composes devtools(), so the extension can load the real @comvi/editor into
// it. Served by mock-api-server.mjs (`/system`); the platform's API and CDN are the local ones
// the platform's tests/system/run.ts started.
//
// Query: `cdn=<Content Deploy base URL>` (required), `locale=<the app's spelling>`.
//
// Every `[data-k]` element renders `t(key, { ns })` and re-renders on every publish, which is
// how the editor's marking and its saved value reach the DOM.
import { createI18n } from "/core/comvi-core.js";
import { cdn } from "/core/comvi-core-cdn.js";
import { devtools } from "/core/comvi-core-devtools.js";
import { core } from "/core/comvi-core-internal.js";

// --- page-side egress monitor: the PAGE never sends credentials ---
window.__PAGE_EGRESS__ = [];
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const auth = init?.headers && new Headers(init.headers).get("authorization");
  window.__PAGE_EGRESS__.push({ url, hasAuth: Boolean(auth) });
  return realFetch(input, init);
};

const params = new URLSearchParams(location.search);
const base = params.get("cdn");
if (!base) throw new Error("system page: ?cdn=<Content Deploy base URL> is required");
const locale = params.get("locale") || "en";
const loader = cdn(base);

/** Every catalog load the page's loader settled, in order: what the SDK requested and got. */
const loads = [];
const recordingLoader = async (l, ns, signal) => {
  try {
    const catalog = await loader(l, ns, signal);
    loads.push({ locale: l, ns, ok: true, keys: Object.keys(catalog) });
    return catalog;
  } catch (error) {
    loads.push({ locale: l, ns, ok: false, error: String(error) });
    throw error;
  }
};

const i18n = createI18n({
  locale,
  fallbackLocale: "en",
  loader: recordingLoader,
  namespaces: ["common"],
  plugins: [devtools()],
});

function render() {
  for (const el of document.querySelectorAll("[data-k]")) {
    el.textContent = i18n.t(el.dataset.k, { ns: el.dataset.ns || "common" });
  }
}

// --- proxy probe over the extension's DOM channel (the one the editor uses) ---
let sequence = 0;
function proxy(path, { method = "GET", body, timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    const id = `system-${Date.now()}-${++sequence}`;
    const timer = setTimeout(() => {
      removeEventListener("comvi-extension:api-response", onResponse);
      resolve({ denied: true, reason: "no-response (no active session / no extension)" });
    }, timeout);
    function onResponse(event) {
      let detail;
      try {
        detail = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
      } catch {
        return;
      }
      if (!detail || detail.id !== id) return;
      clearTimeout(timer);
      removeEventListener("comvi-extension:api-response", onResponse);
      const denied =
        detail.ok === false ||
        Boolean(detail.networkError) ||
        typeof detail.status !== "number" ||
        detail.status === 0;
      resolve({
        denied,
        status: detail.status,
        networkError: detail.networkError,
        body: detail.body,
      });
    }
    addEventListener("comvi-extension:api-response", onResponse);
    dispatchEvent(
      new CustomEvent("comvi-extension:api-request", {
        detail: JSON.stringify({ id, path, method, body }),
      }),
    );
  });
}

window.systemPage = {
  i18n,
  loads,
  proxy,
  /**
   * The next server snapshot of (locale, ns): the catalog Content Deploy serves now, fetched by
   * the same `cdn()` loader (so through the browser's HTTP cache, as a reload would be) and
   * handed over the way a framework binding hands a server render over (`core(i18n).f`).
   * Returns the snapshot's value of `key`, or null when the catalog does not have it.
   */
  snapshot: async (key, ns = "common", l = locale) => {
    const catalog = await loader(l, ns);
    core(i18n).f(l, ns, catalog);
    return Object.prototype.hasOwnProperty.call(catalog, key) ? catalog[key] : null;
  },
};

i18n.on(render);
await i18n.ready;
render();
document.body.dataset.booted = "true";
