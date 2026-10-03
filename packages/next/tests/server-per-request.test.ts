// @vitest-environment node
/**
 * The server request contract.
 *
 * One `@comvi/next` host lives at module scope and is shared by every
 * concurrent request an App Router process handles. It contributes the CATALOG
 * and the LOADER; it must never contribute the locale. Every lookup in
 * `src/server/` therefore resolves against the locale resolved for THIS
 * request, and the only writes a request is allowed to make to the shared host
 * are the two pinned below.
 *
 * The environment is `node` on purpose: the request pipeline is server-only,
 * and a DOM environment would let the client branches run instead.
 */

import React from "react";
import { renderToString } from "react-dom/server";
import { describe, it, expect, vi, afterEach } from "vitest";

import { createNextI18n } from "../src/createNextI18n";
import { _resetServerI18n, setI18n } from "../src/server/cache";
import { getI18n } from "../src/server/getI18n";
import { getLocale } from "../src/server/getLocale";

vi.mock("../src/server/getLocale", () => ({ getLocale: vi.fn() }));

const getLocaleMock = vi.mocked(getLocale);

const CATALOGS: Record<string, Record<string, string>> = {
  en: { greeting: "Hello", englishOnly: "English only" },
  fr: { greeting: "Bonjour" },
  de: { greeting: "Guten Tag" },
};

/**
 * A host with the default locale "en" and a loader that answers every locale,
 * so "which locale did the pipeline ask for" is always visible in the calls.
 */
const createHost = () => {
  const { i18n } = createNextI18n({
    locales: ["en", "fr", "de"],
    defaultLocale: "en",
    defaultNs: "common",
    devMode: false,
  });
  const loader = vi.fn(async (language: string) => CATALOGS[language] ?? {});
  i18n.registerLoader(loader);
  setI18n(i18n);
  return { i18n, loader };
};

/**
 * Shadows the `locale` accessor with an own property that records writes, so
 * "assigned the same locale again" stays distinguishable from "left alone".
 */
const recordLocaleWrites = (i18n: { locale: string }): string[] => {
  const writes: string[] = [];
  let current = i18n.locale;
  Object.defineProperty(i18n, "locale", {
    get: () => current,
    set: (value: string) => {
      writes.push(value);
      current = value;
    },
    configurable: true,
  });
  return writes;
};

const Greeting = ({ t }: { t: (key: string) => string }) =>
  React.createElement("span", null, t("greeting"));

describe("getI18n resolves every lookup against the request locale", () => {
  afterEach(() => {
    _resetServerI18n();
  });

  it("two interleaved server renders on one host → each tree keeps its own locale", async () => {
    const { i18n } = createHost();
    const fr = await getI18n({ locale: "fr" });
    const de = await getI18n({ locale: "de" });
    const namespacesBefore = i18n.getActiveNamespaces();
    const localeWrites = recordLocaleWrites(i18n);

    // The "de" request renders in the middle of the "fr" request, which is what
    // two concurrent App Router requests do to one module-scope instance.
    let innerHtml = "";
    const outerHtml = renderToString(
      React.createElement(() => {
        innerHtml = renderToString(React.createElement(Greeting, { t: de.t }));
        return React.createElement(Greeting, { t: fr.t });
      }),
    );

    expect(outerHtml).toContain("Bonjour");
    expect(innerHtml).toContain("Guten Tag");
    expect(localeWrites).toEqual([]);
    expect(i18n.getActiveNamespaces()).toEqual(namespacesBefore);
  });

  it("two concurrent getI18n() calls at different locales → one load per locale:namespace", async () => {
    const { loader } = createHost();

    const [fr, de] = await Promise.all([getI18n({ locale: "fr" }), getI18n({ locale: "de" })]);

    expect(fr.t("greeting")).toBe("Bonjour");
    expect(de.t("greeting")).toBe("Guten Tag");
    expect(loader.mock.calls).toEqual([
      ["en", "common"],
      ["fr", "common"],
      ["de", "common"],
    ]);
  });

  it("hasTranslation without an explicit locale → the request locale, not the host's", async () => {
    const { i18n } = createHost();

    const { hasTranslation } = await getI18n({ locale: "fr" });

    expect(i18n.locale).toBe("en");
    expect(hasTranslation("greeting")).toBe(true);
    expect(hasTranslation("englishOnly")).toBe(false);
    expect(hasTranslation("englishOnly", { locale: "en" })).toBe(true);
  });

  it("a request whose locale cannot be resolved → throws before the host is initialized", async () => {
    const { i18n, loader } = createHost();
    const initSpy = vi.spyOn(i18n, "init");
    getLocaleMock.mockRejectedValue(new Error("no locale"));

    await expect(getI18n()).rejects.toThrow("[comvi/next] Locale not set.");

    expect(initSpy).not.toHaveBeenCalled();
    expect(loader).not.toHaveBeenCalled();
    expect(i18n.isInitialized).toBe(false);
  });

  it("a locale-less request against a failing init() → the locale error wins", async () => {
    const { i18n } = createHost();
    vi.spyOn(i18n, "init").mockRejectedValue(new Error("init exploded"));
    getLocaleMock.mockRejectedValue(new Error("no locale"));

    // Both would fail; the request is rejected on its own terms, and the
    // instance-wide failure never enters the picture.
    await expect(getI18n()).rejects.toThrow("[comvi/next] Locale not set.");
  });
});

describe("the two request→global writes the shared host still accepts", () => {
  afterEach(() => {
    _resetServerI18n();
  });

  it("init() loads the default namespace once, at the host's own locale", async () => {
    const { i18n, loader } = createHost();

    await getI18n({ locale: "fr" });
    await getI18n({ locale: "fr" });

    // "en:common" is init()'s one-time load at the host's STATIC locale; it is
    // not repeated, and no request locale ever reaches it.
    expect(loader.mock.calls).toEqual([
      ["en", "common"],
      ["fr", "common"],
    ]);
    expect(i18n.locale).toBe("en");
  });

  it("a request at a namespace the host never activated leaves the active set alone", async () => {
    const { i18n, loader } = createHost();
    await getI18n({ locale: "fr" });
    const namespacesBefore = i18n.getActiveNamespaces();

    await getI18n({ locale: "fr", ns: "admin" });

    // "admin" is loaded for this request and cached, but a namespace the host
    // treats as ACTIVE is one it reloads on every locale switch, for every
    // other request too. Only the app's own configuration may add one.
    expect(namespacesBefore).toEqual(["common"]);
    expect(i18n.getActiveNamespaces()).toEqual(namespacesBefore);
    // "en:admin" is the fallback chain's copy: the request's `t()` resolves
    // an admin key missing in fr through it.
    expect(loader.mock.calls).toEqual([
      ["en", "common"],
      ["fr", "common"],
      ["fr", "admin"],
      ["en", "admin"],
    ]);
  });

  it("a namespace another request already loaded is reused, never reloaded", async () => {
    const { loader } = createHost();

    const first = await getI18n({ locale: "fr" });
    const second = await getI18n({ locale: "fr", ns: "common" });

    expect(first.t("greeting")).toBe("Bonjour");
    expect(second.t("greeting")).toBe("Bonjour");
    expect(loader.mock.calls).toEqual([
      ["en", "common"],
      ["fr", "common"],
    ]);
  });
});
