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

type Flags = [boolean, boolean];
const seen: string[] = [];
function Tpl({ ns }: { ns?: string }) {
  const { t, isReady, isLoading } = ns ? useI18n(ns) : useI18n();
  const f: Flags = [isReady, isLoading];
  seen.push(f.join("/"));
  return isReady ? <p>{t("title") as string}</p> : isLoading ? <i>loading</i> : <b>unavailable</b>;
}

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
  const ui = (i: I18n) => (
    <I18nProvider i18n={i}>
      <I18nHandover catalogs={payload.catalogs}>
        <Tpl ns={o.noArg ? undefined : o.ns} />
      </I18nHandover>
    </I18nProvider>
  );
  seen.length = 0;
  const html = renderToString(ui(server));
  const serverFlags = seen.splice(0);
  const loader = vi.fn(async (l: string, n: string) => ({ title: `client ${l}:${n}` }));
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
  await act(async () => {
    roots.push(hydrateRoot(el, ui(client), { onRecoverableError: (e) => recoverable.push(e) }));
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
