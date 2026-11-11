// @vitest-environment node
/**
 * `createGetI18n` (lot 6a, brief §2): an instance per request, the locale matched before it
 * exists, one load per (request, locale, namespace), explicit namespaces, no request API read
 * for an explicit locale. React's `cache()` memoizes per request only in a react-server graph;
 * here it is replaced by the same contract over a `request` scope the test opens, so the keys
 * the helper memoizes on are what is tested (the real `cache()` runs in the e2e of
 * `scripts/test-apps-smoke`).
 */
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handover } from "@comvi/core/ssr";

const scope = vi.hoisted(() => ({ memo: new Map<unknown, Map<string, unknown>>() }));

vi.mock("react", async (orig) => {
  const react = await orig<typeof import("react")>();
  return {
    ...react,
    cache: <A extends unknown[], R>(fn: (...a: A) => R) => {
      return (...args: A): R => {
        let m = scope.memo.get(fn);
        if (!m) scope.memo.set(fn, (m = new Map()));
        const k = JSON.stringify(args);
        if (!m.has(k)) m.set(k, fn(...args));
        return m.get(k) as R;
      };
    },
  };
});

const request = vi.hoisted(() => ({ headers: new Map<string, string>(), reads: 0 }));
vi.mock("next/headers", () => ({
  headers: async () => {
    request.reads++;
    return { get: (k: string) => request.headers.get(k) ?? null };
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { createGetI18n } = await import("../src/server");

const CATALOGS: Record<string, Record<string, string>> = {
  "en:default": { hi: "Hello, {name}!", terms: "Read <link><b>the terms</b></link>." },
  "uk:default": { hi: "Привіт, {name}!", terms: "Прочитайте <link><b>умови</b></link>." },
  "de:default": { hi: "Hallo, {name}!" },
  "en:admin": { title: "Admin" },
  "uk:admin": { title: "Адмін" },
};

let asked: string[];
let failing: Set<string>;
const loader = async (locale: string, ns: string) => {
  asked.push(`${locale}:${ns}`);
  if (failing.has(`${locale}:${ns}`) || !CATALOGS[`${locale}:${ns}`]) throw new Error("404");
  return CATALOGS[`${locale}:${ns}`];
};
const getI18n = () =>
  createGetI18n({
    locales: ["en", "uk", "de"],
    defaultLocale: "en",
    fallbackLocale: "en",
    timeZone: "UTC",
    loader,
    onError: () => {},
  });

/** A new request: React's request scope. */
const newRequest = (headers: Record<string, string> = {}) => {
  scope.memo = new Map();
  request.headers = new Map(Object.entries(headers));
  request.reads = 0;
};

beforeEach(() => {
  asked = [];
  failing = new Set();
  newRequest();
});

describe("createGetI18n: defaultParams are server data (owner decision 2026-11-11)", () => {
  const base = { locales: ["en"], defaultLocale: "en", timeZone: "UTC", loader, onError: () => {} };
  it.each([
    ["a tag handler", { link: (c: unknown) => c }],
    ["a Date", { link: new Date(0) }],
    ["an array", { link: ["a"] }],
    ["NaN (the types accept any number)", { link: NaN }],
    ["Infinity (the types accept any number)", { link: Infinity }],
  ])("%s in the server configuration is a clear TypeError naming the key", (_, dp) => {
    expect(() =>
      createGetI18n({ ...base, defaultParams: dp as unknown as Record<string, string> }),
    ).toThrow(/^\[@comvi\/next\] defaultParams\.link .*strings, finite numbers, booleans and null/);
  });
  it("strings, numbers, booleans and null are read by t() (pinning)", async () => {
    const { t } = await createGetI18n({
      ...base,
      defaultParams: { name: "Ada", n: 1, ok: true, x: null },
    })({
      locale: "en",
    });
    expect(t("hi")).toBe("Hello, Ada!");
  });
});

describe("createGetI18n", () => {
  it("an explicit locale: translated, reads no request API", async () => {
    const { t, locale, dir, i18n } = await getI18n()({ locale: "uk" });
    expect([locale, dir, i18n.locale]).toEqual(["uk", "ltr", "uk"]);
    expect(t("hi", { name: "Ada" })).toBe("Привіт, Ada!");
    expect(request.reads).toBe(0);
  });

  it("nested rich text renders as one React node in a server render", async () => {
    const { t } = await getI18n()({ locale: "uk" });
    const out = t("terms", {
      link: (c: unknown) => <a href="/t">{c as never}</a>,
      b: (c: unknown) => <b>{c as never}</b>,
    });
    expect(isValidElement(out)).toBe(true);
    expect(renderToStaticMarkup(out as ReactElement)).toBe(
      'Прочитайте <a href="/t"><b>умови</b></a>.',
    );
  });

  it("an unsupported locale is notFound() before any load", async () => {
    await expect(getI18n()({ locale: "fr" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(getI18n()({ locale: "../../etc" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(asked).toEqual([]);
  });

  it("no locale: the middleware's header when it is supported, else defaultLocale", async () => {
    const get = getI18n();
    newRequest({ "x-comvi-locale": "de" });
    expect((await get()).locale).toBe("de");
    expect(request.reads).toBe(1);
    newRequest({ "x-comvi-locale": "xx" });
    expect((await get()).locale).toBe("en");
    newRequest();
    expect((await get()).locale).toBe("en");
  });

  it("namespaces are loaded before it resolves; t is bound to the first one", async () => {
    const { t, i18n } = await getI18n()({ locale: "uk", ns: ["admin", "default"] });
    expect(t("title")).toBe("Адмін");
    expect(i18n.t("hi", { name: "A" })).toBe("Привіт, A!");
    expect(asked.sort()).toEqual(["en:admin", "en:default", "uk:admin", "uk:default"]);
  });

  it("one request: the same call is the same instance, and a pair loads once across instances", async () => {
    const get = getI18n();
    const [a, b, c] = await Promise.all([
      get({ locale: "uk" }),
      get({ locale: "uk" }),
      get({ locale: "uk", ns: "admin" }),
    ]);
    expect(a.i18n).toBe(b.i18n);
    expect(c.i18n).not.toBe(a.i18n);
    expect(asked.sort()).toEqual(["en:admin", "en:default", "uk:admin", "uk:default"]);
  });

  it("a failed pair stays failed for the request: rendered through the fallback, handed over as null, not asked twice", async () => {
    failing.add("uk:admin");
    const get = getI18n();
    const { t, i18n } = await get({ locale: "uk", ns: "admin" });
    expect(t("title")).toBe("Admin");
    expect(handover(i18n).catalogs.admin).toEqual({ en: { title: "Admin" }, uk: null });
    await get({ locale: "uk", ns: ["admin", "default"] });
    expect(asked.filter((p) => p === "uk:admin")).toEqual(["uk:admin"]);
  });

  it("two requests share no instance and no state, in parallel too", async () => {
    const get = getI18n();
    newRequest();
    const uk = get({ locale: "uk" });
    newRequest();
    const de = get({ locale: "de" });
    const [u, d] = await Promise.all([uk, de]);
    expect(u.i18n).not.toBe(d.i18n);
    expect([u.t("hi", { name: "A" }), d.t("hi", { name: "A" })]).toEqual([
      "Привіт, A!",
      "Hallo, A!",
    ]);
    // The next request asks again: nothing outlives a request.
    newRequest();
    await get({ locale: "uk" });
    expect(asked.filter((p) => p === "uk:default")).toEqual(["uk:default", "uk:default"]);
  });
});
