// A Comvi 0.8 site for Gate E: plain DOM, the REAL built @comvi/core (packages/core/dist,
// served by mock-api-server.mjs under /core/ and, as a second copy of core, /core2/) with
// devtools(). No inline script or style, so the page runs under a strict CSP. Catalogs load
// from /catalog/<locale>/<ns>.json, which the mock platform serves from its own store, as a
// CDN would after a publish.
//
// Every region renders one instance: `[data-k]` elements get `t(key)` and re-render on every
// publish (`i18n.on`), which is how marking reaches the DOM once the editor calls `x.mark`.
// Query: `instances=3` (A and B on /core/, C on /core2/), `late=1` (no instance until
// `gateE.create()`), `locale=de`.
import { createI18n } from "/core/comvi-core.js";
import { devtools } from "/core/comvi-core-devtools.js";
import { core } from "/core/comvi-core-internal.js";

const params = new URLSearchParams(location.search);

/** A message's output as DOM nodes: a string, or rich parts (strings and elements). */
function nodes(out) {
  const parts = Array.isArray(out) ? out : [out];
  return parts.flatMap((part) =>
    part instanceof Node ? [part] : Array.isArray(part) ? nodes(part) : [String(part)],
  );
}

const bold = (chunks) => {
  const b = document.createElement("b");
  b.append(...nodes(chunks));
  return b;
};

/** Renders every `[data-k]` of `root` from `i18n`. */
function render(i18n, root) {
  for (const el of root.querySelectorAll("[data-k]")) {
    const params = {};
    if (el.dataset.ns) params.ns = el.dataset.ns;
    if (el.dataset.rich !== undefined) params.b = bold;
    if (el.dataset.markers === "off") params.markers = false;
    // One element, two translations: a rich pair, then a plain string after it.
    if (el.dataset.combo !== undefined) {
      el.replaceChildren(
        ...nodes(i18n.t(el.dataset.k, { b: bold })),
        " · ",
        ...nodes(i18n.t(el.dataset.combo)),
      );
      continue;
    }
    el.replaceChildren(...nodes(i18n.t(el.dataset.k, params)));
  }
}

const loader = (locale, ns, signal) =>
  fetch(`/catalog/${locale}/${ns}.json`, { signal }).then((response) => {
    if (!response.ok) throw new Error(`catalog ${locale}/${ns}: ${response.status}`);
    return response.json();
  });

/** The cores a region may be built on: two copies of the same dist. */
const cores = {
  core1: { createI18n, devtools, core },
  core2: null,
};

async function coreCopy(name) {
  if (name === "core1") return cores.core1;
  cores.core2 ??= await Promise.all([
    import("/core2/comvi-core.js"),
    import("/core2/comvi-core-devtools.js"),
  ]).then(([c, d]) => ({ createI18n: c.createI18n, devtools: d.devtools }));
  return cores.core2;
}

const instances = {};

/** Creates the instance of region `name` and renders it on every publish. */
async function create(name = "A", copy = "core1") {
  const { createI18n: make, devtools: dev } = await coreCopy(copy);
  const root = document.getElementById(`region-${name}`);
  const i18n = make({
    locale: params.get("locale") || "en",
    fallbackLocale: "en",
    loader: (locale, ns, signal) => loader(name === "A" ? locale : `${locale}-${name}`, ns, signal),
    namespaces: ["default", "common"],
    plugins: [dev()],
  });
  instances[name] = { i18n, root };
  i18n.on(() => render(i18n, root));
  await i18n.ready;
  render(i18n, root);
  root.dataset.ready = "true";
  return i18n;
}

window.gateE = {
  instances,
  /** Two copies of core are two module graphs: their createI18n differ. */
  twoCopies: () => Boolean(cores.core2) && cores.core1.createI18n !== cores.core2.createI18n,
  create,
  /** Re-renders a region, as a component would on its own update. */
  render: (name = "A") => render(instances[name].i18n, instances[name].root),
  setLocale: (locale, name = "A") => instances[name].i18n.setLocale(locale),
  destroy: (name) => {
    instances[name].i18n.destroy();
    delete instances[name];
  },
  /** A new server snapshot of one pair (what a framework handover does after navigation). */
  snapshot: (locale, ns, catalog, name = "A") => core(instances[name].i18n).f(locale, ns, catalog),
  /** A client navigation: the route's region is replaced and its namespace loaded. */
  navigate: async (route) => {
    history.pushState({}, "", `/app/${route}${location.search}`);
    const { i18n, root } = instances.A;
    const view = document.getElementById("route");
    view.replaceChildren();
    if (route === "about") {
      await i18n.load("about");
      for (const [k, ns] of [
        ["about.title", "about"],
        ["home.title", undefined],
      ]) {
        const el = document.createElement("p");
        el.dataset.k = k;
        if (ns) el.dataset.ns = ns;
        el.id = `route-${k.replace(".", "-")}`;
        view.append(el);
      }
    }
    render(i18n, root);
  },
  /** What the page's own logic computes from a translation, to prove it still works. */
  appWorks: () => {
    const button = document.getElementById("counter");
    button.click();
    return button.dataset.count;
  },
};

document.getElementById("counter").addEventListener("click", (event) => {
  const button = event.currentTarget;
  button.dataset.count = String(Number(button.dataset.count || "0") + 1);
});

const count = Number(params.get("instances") || "1");
if (params.get("late") !== "1") {
  await create("A", "core1");
  if (count >= 2) await create("B", "core1");
  if (count >= 3) await create("C", "core2");
}
document.body.dataset.booted = "true";
