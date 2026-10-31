/**
 * Server rendering (R3-18, R3-21; lot 5): both halves are real, the HTML comes out of Solid's
 * server build compiled `generate: "ssr"` (vitest.config.ts) and `hydrate()` runs on that
 * exact string from the browser build. A server render holds `useI18n(ns)` per request and
 * waits through `createResource`, under a Suspense boundary; `handover()` carries what it
 * loaded; the browser renders the same text, requests nothing and reports no mismatch.
 */
import { hydrate } from "solid-js/web";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n, handover, I18nProvider, type Catalog } from "../../src";
import { manualLoader, make, tick } from "../helpers";
import { Account, Ago, Keyed, Lines, Page, Provide } from "./app";

type Server = typeof import("./render.server");
let server: Server;

const CATALOGS: Record<string, Catalog> = {
  "en:default": {
    hi: "Hello, {name}!",
    terms: "Read the <link>terms</link>.",
    lines: "One<br/>Two",
  },
  "de:default": {
    hi: "Hallo, {name}!",
    terms: "Lies die <link>AGB</link>.",
    lines: "Eins<br/>Zwei",
  },
  "en:account": { title: "Account" },
  "de:account": { title: "Konto" },
};
/** A loader that answers after a macrotask, like a network: the render must wait for it. */
const loader =
  (requested: string[] = []) =>
  async (locale: string, ns: string) => {
    requested.push(`${locale}:${ns}`);
    await tick();
    const c = CATALOGS[`${locale}:${ns}`];
    if (!c) throw new Error(`404 ${locale}:${ns}`);
    return c;
  };

/** Hydrates `html` with `view`; what the page shows and what Solid complained about. */
const hydrated = (html: string, view: () => unknown) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = html;
  const nodes = [...container.querySelectorAll("*")];
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const dispose = hydrate(view as never, container);
  const errors = err.mock.calls.map((c) => String(c[0]));
  err.mockRestore();
  return {
    container,
    errors,
    dispose,
    same: nodes.every((n, k) => container.querySelectorAll("*")[k] === n),
  };
};

beforeAll(async () => {
  server = await import("./render.server");
}, 30_000);

beforeEach(() => {
  // What `generateHydrationScript()` puts in the document head; no test page runs it.
  (globalThis as { _$HY?: unknown })._$HY = {
    events: [],
    completed: new WeakSet(),
    r: {},
    fe() {},
  };
});

describe("a server render waits for its catalogs through createResource", () => {
  it("renderToStringAsync under a Suspense boundary: text, not keys; a held namespace is handed over", async () => {
    const requested: string[] = [];
    const i18n = createI18n({ locale: "de", loader: loader(requested), timeZone: "UTC" });
    const html = await server.page(i18n, "keyed");
    expect(html).toContain("Hallo, Ann!");
    expect(html).toContain("Konto");
    expect(html).toContain("AGB");
    expect(html).not.toContain("waiting");
    expect(requested.sort()).toEqual(["de:account", "de:default"]);
    expect(handover(i18n).catalogs.account).toEqual({ de: CATALOGS["de:account"] });
  });

  it("`isReady` branches wait too, with no t() read", async () => {
    const i18n = createI18n({ locale: "en", loader: loader(), timeZone: "UTC" });
    expect(await server.page(i18n, "account")).toContain("Account");
  });

  it("a catalog in place costs no wait", async () => {
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: {} },
      catalogs: { account: { en: { title: "Inline" } } },
    });
    expect(server.sync(i18n, "account")).toContain("Inline");
  });

  it("no Suspense boundary: nothing waits, nothing throws, the loading branch renders", async () => {
    const i18n = createI18n({ locale: "en", loader: loader(), timeZone: "UTC" });
    expect(await server.noBoundary(i18n, "account")).toContain("loading");
  });

  it("sync renderToString: the boundary's fallback; preloaded: the text", async () => {
    const a = createI18n({ locale: "en", loader: loader(), timeZone: "UTC" });
    expect(server.syncPage(a, "account")).toContain("waiting");
    const b = createI18n({ locale: "en", loader: loader(), timeZone: "UTC" });
    await Promise.all([b.ready, b.load("account")]);
    expect(server.syncPage(b, "account")).toContain("Account");
  });

  it("a failed load renders the unavailable branch, rejects nothing, is handed over as null", async () => {
    const { i18n, errors } = make({
      locale: "fr",
      timeZone: "UTC",
      messages: { fr: {} },
      loader: async () => {
        await tick();
        throw new Error("404");
      },
    });
    expect(await server.page(i18n, "account")).toContain("unavailable");
    expect(errors.map((e) => e.code)).toEqual(["load_failed"]);
    expect(handover(i18n).catalogs.account).toEqual({ fr: null });
  });

  it("the hold is per request: two concurrent requests in different locales do not bleed", async () => {
    const out = await Promise.all(
      Array.from({ length: 20 }, (_, n) => {
        const i18n = createI18n({
          locale: n % 2 ? "de" : "en",
          loader: loader(),
          timeZone: "UTC",
        });
        return server.page(i18n, "keyed");
      }),
    );
    out.forEach((html, n) => expect(html).toContain(n % 2 ? "Hallo, Ann!" : "Hello, Ann!"));
  });
});

describe("hydration", () => {
  it("waited on the server: same nodes, no mismatch, 0 requests; a later switch re-renders the hydrated text", async () => {
    const s = createI18n({ locale: "en", loader: loader(), timeZone: "UTC" });
    const html = await server.page(s, "keyed");
    const payload = JSON.parse(JSON.stringify(handover(s)));
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load, ...payload });
    const h = hydrated(html, () => (
      <Page i18n={i18n}>
        <Keyed />
      </Page>
    ));
    expect(h.errors).toEqual([]);
    expect(h.same).toBe(true);
    await tick();
    expect(l.requested).toEqual([]);
    expect(h.container.querySelector("h2")!.textContent).toBe("Account");
    expect(h.container.querySelector("a")!.getAttribute("href")).toBe("/t");
    expect(h.container.querySelector("br")).not.toBeNull();
    const sw = i18n.setLocale("de");
    await l.answer("de:default", CATALOGS["de:default"]);
    await l.answer("de:account", CATALOGS["de:account"]);
    await sw;
    expect(h.container.querySelector("main")!.getAttribute("lang")).toBe("de");
    expect(h.container.querySelector("h1")!.textContent).toBe("Hallo, Ann!");
    expect(h.container.querySelector("h2")!.textContent).toBe("Konto");
    expect(h.container.querySelector("a")!.textContent).toBe("AGB");
    h.dispose();
  });

  it("the hold starts at mount and releases once on dispose", async () => {
    const s = createI18n({ locale: "en", loader: loader(), timeZone: "UTC" });
    const html = await server.page(s, "account");
    const payload = JSON.parse(JSON.stringify(handover(s)));
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load, ...payload });
    const h = hydrated(html, () => (
      <Page i18n={i18n}>
        <Account />
      </Page>
    ));
    await tick();
    h.dispose();
    const sw = i18n.setLocale("fr");
    expect(l.requested).toEqual(["fr:default"]); // released: account not loaded
    await l.answer("fr:default");
    await sw;
  });

  it("not preloaded, sync, no boundary: the server and the hydration both render 'loading'; then the browser loads it", async () => {
    const s = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: {} },
      loader: () => new Promise(() => {}),
    });
    const html = server.sync(s, "account");
    expect(html).toContain("loading");
    const payload = JSON.parse(JSON.stringify(handover(s)));
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load, ...payload });
    const h = hydrated(html, () => (
      <Provide i18n={i18n}>
        <Account />
      </Provide>
    ));
    expect(h.errors).toEqual([]);
    expect(h.container.textContent).toBe("loading");
    await tick();
    expect(l.requested).toEqual(["en:account"]);
    await l.answer("en:account", { title: "Account" });
    expect(h.container.textContent).toBe("Account");
    h.dispose();
  });

  it("no first-paint gate in a hydration, with a load in flight: it renders what the server rendered", async () => {
    const s = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: {} },
      loader: () => new Promise(() => {}),
    });
    const html = server.syncGated(s);
    expect(html).toContain("loading");
    expect(html).not.toContain("gate");
    const payload = JSON.parse(JSON.stringify(handover(s)));
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load, ...payload, catalogs: {} });
    const h = hydrated(html, () => (
      <I18nProvider i18n={i18n} loading="gate">
        <Account />
      </I18nProvider>
    ));
    expect(h.errors).toEqual([]);
    expect(h.container.textContent).toBe("loading");
    h.dispose();
  });

  it("a server clock holds through this component's hydration, the browser's after its mount", async () => {
    vi.useFakeTimers({ now: 940_000, toFake: ["Date"] });
    try {
      const s = createI18n({ locale: "en", messages: { en: {} }, timeZone: "UTC" });
      const html = server.sync(s, "ago");
      expect(html).toContain("1 minute ago");
      const payload = JSON.parse(JSON.stringify(handover(s)));
      expect(payload.serverNow).toBe(940_000);
      vi.setSystemTime(1_000_000);
      const i18n = createI18n({ locale: "en", ...payload });
      const h = hydrated(html, () => (
        <Provide i18n={i18n}>
          <Ago />
        </Provide>
      ));
      expect(h.errors).toEqual([]);
      // The hydrated component went live at its mount, as React's re-render after hydration.
      await tick();
      expect(h.container.textContent).toBe("2 minutes ago");
      h.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what a server render writes", () => {
  it.each(["void", "closed"])("<T components={{ br: 'br' }}> on %s: a real <br>", (k) => {
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: { void: "One<br/>Two", closed: "One<br></br>Two" } },
    });
    const html = server.sync(i18n, "lines", { k });
    expect(html.replace(/ ?data-hk="[^"]*"/g, "")).toMatch(/^One<br ?\/?>Two$/);
    const h = hydrated(html, () => (
      <Provide i18n={i18n}>
        <Lines k={k} />
      </Provide>
    ));
    expect(h.errors).toEqual([]);
    expect(h.container.innerHTML.replace(/ ?data-hk="[^"]*"/g, "")).toBe("One<br>Two");
    h.dispose();
  });

  it("an empty tag gives a component no children on the server too", () => {
    const i18n = createI18n({ locale: "en", timeZone: "UTC", messages: { en: { m: "<p/>" } } });
    expect(server.sync(i18n, "empty").replace(/ ?data-hk="[^"]*"/g, "")).toBe("<i></i>");
  });

  it("a parameter is escaped, with no element around <T> too", () => {
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: { hi: "Hi {name}" } },
    });
    const html = server.sync(i18n, "bare", { name: "<img src=x>" });
    expect(html).toBe("Hi &lt;img src=x>");
  });

  it("useFormat() renders with the real instance and the request's locale", () => {
    const i18n = createI18n({ locale: "de", timeZone: "UTC", messages: { de: {} } });
    expect(server.sync(i18n, "price")).toContain(new Intl.NumberFormat("de").format(1234.5));
  });

  it("handover() throws without a timeZone (development)", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } });
    expect(() => handover(i18n)).toThrow("[@comvi/core] a server render needs the timeZone option");
  });

  it("a locale from a route is matched first: createI18n throws a RangeError for a non-tag", () => {
    expect(() => createI18n({ locale: "../etc/passwd" })).toThrow(RangeError);
  });
});
