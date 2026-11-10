/**
 * A real hydration (`renderToString` on a server instance, `hydrateRoot` on a client instance)
 * with a slot the server could not load (`null` in `handover()`), read through the ordinary
 * readiness template `isReady ? content : isLoading ? loader : unavailable`.
 */
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handover } from "@comvi/core/ssr";
import { createI18n, I18nHandover, I18nProvider, useI18n, type I18n } from "../src";

const seen: string[] = [];
type Flags = { t: (k: string) => unknown; isReady: boolean; isLoading: boolean };
const branch = ({ t, isReady, isLoading }: Flags) => {
  seen.push(`${isReady}/${isLoading}`);
  return isReady ? <p>{t("title") as string}</p> : isLoading ? <i>loading</i> : <b>unavailable</b>;
};
/** The template through `useI18n()` (namespace `default`). */
const TplDefault = () => branch(useI18n());
/** The template through `useI18n(ns)`. */
const TplNs = ({ ns }: { ns: string }) => branch(useI18n(ns));

let roots: { unmount(): void }[] = [];
afterEach(() => {
  roots.forEach((r) => r.unmount());
  roots = [];
  document.body.innerHTML = "";
});

/**
 * Server: an instance whose loader fails `ns:uk` (and `ns:en` unless `fallback`), loaded before
 * the render. Client: created as the README says (`{ ...options, ...handover }`) or, `late`,
 * without the payload, which then reaches it only through `<I18nHandover catalogs>`.
 */
async function hydrate(o: {
  ns: string;
  noArg: boolean;
  fallback: boolean;
  loader: boolean;
  late?: boolean;
}) {
  const fail = (l: string, n: string) => n === o.ns && (l === "uk" || !o.fallback);
  const server = createI18n({
    locale: "uk",
    fallbackLocale: "en",
    timeZone: "UTC",
    loader: async (l, n) => {
      if (fail(l, n)) throw new Error("down");
      return { title: `${l}:${n}` };
    },
    onError: () => {},
  });
  await server.load(o.ns).catch(() => {});
  const payload = handover(server);
  const ui = (i: I18n, catalogs = payload.catalogs) => (
    <I18nProvider i18n={i}>
      <I18nHandover catalogs={catalogs}>
        {o.noArg ? <TplDefault /> : <TplNs ns={o.ns} />}
      </I18nHandover>
    </I18nProvider>
  );
  seen.length = 0;
  const html = renderToString(ui(server));
  const serverFlags = seen.splice(0);
  // A client load answers when the test releases it (`release()`), so its flight is observable.
  const gates: (() => void)[] = [];
  const loader = vi.fn(
    (l: string, n: string) =>
      new Promise<Record<string, string>>((ok) =>
        gates.push(() => ok({ title: `client ${l}:${n}` })),
      ),
  );
  const client = createI18n({
    fallbackLocale: "en",
    ...(o.loader && { loader }),
    onError: () => {},
    // `late`: the instance has the layout's `default` (so it loads nothing at creation); the
    // payload with the failed namespace reaches it only through `<I18nHandover catalogs>`.
    ...(o.late
      ? {
          locale: "uk",
          timeZone: "UTC",
          serverNow: payload.serverNow,
          catalogs: { default: { uk: { x: "x" }, en: { x: "x" } } },
        }
      : payload),
  });
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.append(el);
  const recoverable: unknown[] = [];
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const root = hydrateRoot(el, ui(client), { onRecoverableError: (e) => recoverable.push(e) });
  await act(async () => {
    roots.push(root);
  });
  await act(async () => {});
  const errors = err.mock.calls.map((c) => String(c[0]));
  err.mockRestore();
  return {
    payload,
    html,
    serverFlags,
    clientFlags: seen.splice(0),
    after: el.innerHTML,
    recoverable,
    errors,
    loads: loader.mock.calls.map((c) => c.join(":")),
    client,
    el,
    /** The pairs the client loader was asked for. */
    asked: () => loader.mock.calls.map((c) => `${c[0]}:${c[1]}`),
    release: async () => {
      await act(async () => gates.splice(0).forEach((g) => g()));
    },
    /** The next payload of the same mount (a `router.refresh()`). */
    rerender: async (catalogs: typeof payload.catalogs) => {
      await act(async () => root.render(ui(client, catalogs)));
    },
  };
}

describe("hydration with a `null` slot (the ordinary readiness template)", () => {
  // `useI18n()` reads `default`; `useI18n(ns)` reads `admin`. Pinning tests of the documented
  // order (the first paint's payload goes to `createI18n`, as in `@comvi/next/client`): the
  // hydration render computes the server's `isReady`/`isLoading`, so the branch, the HTML and
  // the requests match. The same holds for a payload that reaches the instance only through
  // `<I18nHandover catalogs>`, with or without a client loader: the view renders a `null` pair as
  // failed, as the server did.
  const cases = [
    { name: "useI18n()", ns: "default", noArg: true },
    { name: "useI18n(ns)", ns: "admin", noArg: false },
  ];
  for (const c of cases)
    for (const [late, loader] of [
      [false, false],
      [false, true],
      [true, false],
      // Red before the fix (2026-11-10): the view left the `null` pair out and `isLoading`
      // predicted the hold's load, so with no catalog the hydration rendered the loader where
      // the server rendered "unavailable" (React: "Hydration failed …").
      [true, true],
    ])
      for (const fallback of [false, true])
        it(`${c.name}, ${late ? "payload through <I18nHandover> only" : "instance from the payload"}, ${fallback ? "fallback loaded" : "no catalog at all"}, ${loader ? "with" : "without"} a client loader: same branch, no warning, no request`, async () => {
          const r = await hydrate({ ...c, fallback, loader, late });
          expect(r.payload.catalogs[c.ns]?.uk).toBe(null);
          expect(r.html).toContain(fallback ? "<p>en:" : "<b>unavailable</b>");
          expect(r.serverFlags).toEqual([fallback ? "true/false" : "false/false"]);
          // Every client render, the hydration's first, computes what the server computed.
          expect(r.clientFlags.length).toBeGreaterThan(0);
          expect(r.clientFlags.every((f) => f === r.serverFlags[0])).toBe(true);
          expect(r.recoverable).toEqual([]);
          expect(r.errors).toEqual([]);
          expect(r.after).toBe(r.html);
          expect(r.loads).toEqual([]);
        });
});

describe("after such a hydration (payload through <I18nHandover> only, a client loader)", () => {
  const cases = [
    { name: "useI18n()", ns: "default", noArg: true },
    { name: "useI18n(ns)", ns: "admin", noArg: false },
  ];
  const opts = { fallback: false, loader: true, late: true };
  for (const c of cases) {
    it(`${c.name}: an explicit load(ns) asks for the pair, isLoading follows it and it settles`, async () => {
      const r = await hydrate({ ...c, ...opts });
      expect(r.el.innerHTML).toBe("<b>unavailable</b>");
      expect(r.asked()).toEqual([]);
      let done = false;
      const p = r.client.load(c.ns).then(() => (done = true));
      await act(async () => {});
      expect(r.asked()).toContain(`uk:${c.ns}`);
      expect(seen.at(-1)).toBe("false/true");
      expect(r.el.innerHTML).toBe("<i>loading</i>");
      await r.release();
      await act(() => p);
      expect(done).toBe(true);
      expect(seen.at(-1)).toBe("true/false");
      expect(r.el.innerHTML).toBe(`<p>client uk:${c.ns}</p>`);
    });

    it(`${c.name}: an explicit setLocale() to the fallback asks for its pair and settles`, async () => {
      const r = await hydrate({ ...c, ...opts });
      const p = r.client.setLocale("en");
      await act(async () => {});
      expect(r.asked()).toContain(`en:${c.ns}`);
      expect(seen.at(-1)?.endsWith("/true")).toBe(true);
      await r.release();
      await act(() => p);
      expect(r.client.locale).toBe("en");
      expect(seen.at(-1)).toBe("true/false");
      expect(r.el.innerHTML).toBe(`<p>client en:${c.ns}</p>`);
    });

    it(`${c.name}: the next payload with a catalog for the pair ends the failed state`, async () => {
      const r = await hydrate({ ...c, ...opts });
      await r.rerender({ [c.ns]: { uk: { title: `server uk:${c.ns}` } } });
      expect(r.el.innerHTML).toBe(`<p>server uk:${c.ns}</p>`);
      expect(seen.at(-1)).toBe("true/false");
      expect(r.client.t("title", { ns: c.ns })).toBe(`server uk:${c.ns}`);
      expect(r.asked()).toEqual([]);
      // A later render of the same payload keeps it (the view holds no earlier `null`).
      await r.rerender({ [c.ns]: { uk: { title: `server uk:${c.ns}` } } });
      expect(seen.at(-1)).toBe("true/false");
      expect(r.asked()).toEqual([]);
    });
  }
});

describe("a load of the pair already in flight on the client at hydration (review F1)", () => {
  // The client instance starts loading the namespace at creation (`default`: it has no catalog
  // of it; `admin`: the `namespaces` option) with a loader that never answers; the payload that
  // fails the pair reaches it only through `<I18nHandover catalogs>`.
  const cases = [
    { name: "useI18n()", ns: "default", el: <TplDefault /> },
    { name: "useI18n(ns)", ns: "admin", el: <TplNs ns="admin" /> },
  ];
  for (const c of cases)
    it(`${c.name}: the hydration reads the server's flags; an explicit retry still shows the flight`, async () => {
      const catalogs = {
        [c.ns]: { uk: null, en: null },
        ...(c.ns !== "default" && { default: { uk: { x: "x" }, en: { x: "x" } } }),
      };
      const server = createI18n({
        locale: "uk",
        fallbackLocale: "en",
        timeZone: "UTC",
        catalogs,
        onError: () => {},
      });
      const ui = (i: I18n) => (
        <I18nProvider i18n={i}>
          <I18nHandover catalogs={catalogs}>{c.el}</I18nHandover>
        </I18nProvider>
      );
      seen.length = 0;
      const html = renderToString(ui(server));
      expect(html).toBe("<b>unavailable</b>");
      expect(seen.splice(0)).toEqual(["false/false"]);
      const loader = vi.fn(
        (_l: string, _n: string) => new Promise<Record<string, string>>(() => {}),
      );
      const client = createI18n({
        locale: "uk",
        fallbackLocale: "en",
        timeZone: "UTC",
        loader,
        onError: () => {},
        ...(c.ns !== "default" && {
          namespaces: [c.ns],
          catalogs: { default: { uk: { x: "x" }, en: { x: "x" } } },
        }),
      });
      // The creation's own load of the pair is in flight before any render.
      expect(loader.mock.calls.map((x) => `${x[0]}:${x[1]}`)).toContain(`uk:${c.ns}`);
      const el = document.createElement("div");
      el.innerHTML = html;
      document.body.append(el);
      const recoverable: unknown[] = [];
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      await act(async () => {
        roots.push(hydrateRoot(el, ui(client), { onRecoverableError: (e) => recoverable.push(e) }));
      });
      await act(async () => {});
      const errors = err.mock.calls.map((x) => String(x[0]));
      err.mockRestore();
      expect(seen.every((f) => f === "false/false")).toBe(true);
      expect(recoverable).toEqual([]);
      expect(errors).toEqual([]);
      expect(el.innerHTML).toBe(html);
      // An explicit retry after the commit: the new flight shows.
      const calls = loader.mock.calls.length;
      void client.load(c.ns).catch(() => {});
      await act(async () => {});
      expect(loader.mock.calls.length).toBeGreaterThan(calls);
      expect(seen.at(-1)).toBe("false/true");
      expect(el.innerHTML).toBe("<i>loading</i>");
    });
});

describe("nested handovers (review F2)", () => {
  it("an inner handover with an unrelated payload keeps the outer one's failed pair", async () => {
    const outer = { admin: { en: null } };
    const inner = { default: { en: { x: "x" } } };
    const server = createI18n({
      locale: "en",
      timeZone: "UTC",
      catalogs: { ...outer, ...inner },
      onError: () => {},
    });
    const ui = (i: I18n, innerCatalogs: typeof inner | { admin: { en: { title: string } } }) => (
      <I18nProvider i18n={i}>
        <I18nHandover catalogs={outer}>
          <I18nHandover catalogs={innerCatalogs}>
            <TplNs ns="admin" />
          </I18nHandover>
        </I18nHandover>
      </I18nProvider>
    );
    seen.length = 0;
    const html = renderToString(ui(server, inner));
    expect(html).toBe("<b>unavailable</b>");
    expect(seen.splice(0)).toEqual(["false/false"]);
    const loader = vi.fn(async (_l: string, _n: string) => ({ title: "client" }));
    const client = createI18n({ locale: "en", timeZone: "UTC", loader, onError: () => {} });
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.append(el);
    const recoverable: unknown[] = [];
    const root = hydrateRoot(el, ui(client, inner), {
      onRecoverableError: (e) => recoverable.push(e),
    });
    roots.push(root);
    await act(async () => {});
    expect(seen.every((f) => f === "false/false")).toBe(true);
    expect(recoverable).toEqual([]);
    expect(el.innerHTML).toBe(html);
    expect(loader.mock.calls.filter((c) => c[1] === "admin")).toEqual([]);
    // An inner payload that hands a catalog for the pair ends the failed state below it.
    await act(async () => root.render(ui(client, { admin: { en: { title: "inner" } } })));
    expect(el.innerHTML).toBe("<p>inner</p>");
    expect(seen.at(-1)).toBe("true/false");
  });
});
