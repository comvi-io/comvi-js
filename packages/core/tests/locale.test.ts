/**
 * Locale tags: the negotiation golden table of design §1.5 (one function for core,
 * the detector, Next and Nuxt), canonicalization, the script-aware parent chain, dir.
 * Ported by meaning from: languages, text-direction-fallback, locale-detector-arbitration
 * (negotiation half); lot-0 S7 test-all.mjs negotiation rows.
 */
import { describe, expect, it } from "vitest";
import { _resetLocaleCache, canonicalize, dir, negotiate, parents } from "../src/locale";

describe("negotiate — golden table (design §1.5)", () => {
  it.each([
    [["pt-BR"], ["en", "pt"], "pt", "pt-BR → pt"],
    [["pt-BR"], ["en", "de"], "en", "pt-BR → pt → fallback en"],
    [["zh-HK"], ["en", "zh-CN", "zh-TW"], "zh-TW", "zh-HK → zh-TW, never zh-CN"],
    [["zh-Hant"], ["en", "zh-CN", "zh-TW"], "zh-TW", "zh-Hant → zh-TW"],
    [["zh-HK"], ["en", "zh-CN"], "en", "zh-HK never zh-CN"],
    [["sr-Cyrl"], ["en", "sr-Latn"], "en", "sr-Cyrl never sr-Latn"],
    [["sr-Latn"], ["en", "sr"], "en", "sr-Latn never sr (Cyrl)"],
    [["iw"], ["en", "he"], "he", "iw → he"],
    [["he"], ["en", "iw"], "iw", "he → iw, spelled as the app spells it"],
    [["en_US"], ["de", "en-US"], "en-US", "en_US → en-US"],
    [["EN-us"], ["de", "en-US"], "en-US", "EN-us → en-US"],
    [["uk-UA", "de-DE"], ["en", "de"], "de", "navigator uk-UA, de-DE → de"],
    [["pt-PT"], ["en", "pt-BR"], "pt-BR", "pt-PT → pt-BR (same language and script)"],
    [["en"], ["en-GB", "en-US"], "en-US", "en → en-US (likely region preferred)"],
    [["en-GB"], ["en-US", "en-GB"], "en-GB", "exact match wins"],
    [["de-AT"], ["de-CH", "de"], "de", "parent beats a sibling region"],
  ])("%j × %j → %s (%s)", (requested, supported, want) => {
    expect(negotiate(requested, supported, "en")).toBe(want);
  });

  it("returns the fallback (or undefined) when nothing matches", () => {
    expect(negotiate("ja", ["en", "de"], "de")).toBe("de");
    expect(negotiate("ja", ["en", "de"])).toBeUndefined();
  });

  it("ignores malformed tags on either side", () => {
    expect(negotiate(["x!", "de"], ["!!", "de"], "en")).toBe("de");
    expect(negotiate([], ["de"], "en")).toBe("en");
  });

  it("takes a single string", () => {
    expect(negotiate("de-DE", ["en", "de"])).toBe("de");
  });
});

describe("canonicalize", () => {
  it.each([
    ["en_US", "en-US"],
    ["EN-us", "en-US"],
    ["iw", "he"],
    ["zh-hant-hk", "zh-Hant-HK"],
    ["sr_latn_rs", "sr-Latn-RS"],
    ["en-u-nu-thai", "en-u-nu-thai"],
  ])("%s → %s", (tag, want) => {
    expect(canonicalize(tag)).toBe(want);
  });

  it.each(["", "x!", "en--US", "a", "toolonglanguagetag"])("%j is not a tag", (tag) => {
    expect(canonicalize(tag)).toBeUndefined();
  });
});

describe("parents", () => {
  it.each([
    ["pt-BR", ["pt"]],
    ["zh-HK", []],
    ["zh-TW", []],
    ["zh-CN", ["zh"]],
    ["zh-Hant-HK", ["zh-Hant"]],
    ["sr-Latn-RS", ["sr-Latn"]],
    ["sr-Cyrl-RS", ["sr-Cyrl", "sr"]],
    ["en-US-u-nu-thai", ["en-US", "en"]],
    ["de-DE-1996", ["de-DE", "de"]],
    ["en", []],
  ])("%s → %j", (tag, want) => {
    expect(parents(tag)).toEqual(want);
  });
});

describe("dir", () => {
  it.each([
    ["ar", "rtl"],
    ["ar-EG", "rtl"],
    ["he", "rtl"],
    ["fa", "rtl"],
    ["ur", "rtl"],
    ["ckb", "rtl"],
    ["dv", "rtl"],
    ["ku", "ltr"],
    ["az-Arab", "rtl"],
    ["en", "ltr"],
    ["uk", "ltr"],
    ["ja", "ltr"],
  ])("%s → %s", (tag, want) => {
    expect(dir(tag)).toBe(want);
  });
});

describe("negotiate — ranking", () => {
  it("an exact match beats a parent; a nearer parent beats a farther one", () => {
    expect(negotiate("de-AT", ["de", "de-AT"])).toBe("de-AT");
    expect(negotiate("de-AT-u-co-phonebk", ["de", "de-AT"])).toBe("de-AT");
  });
});

describe("the tag memo", () => {
  it("serves a parent chain as one shared array", () => {
    expect(parents("pt-BR")).toBe(parents("pt-BR"));
  });

  it("keeps canonical forms, likely subtags and parents apart, whatever the tags spell", () => {
    // Keys are kind + tag: "c"+"e" vs "m"+"e"… a tag that starts with another kind's letter.
    expect(canonicalize("e")).toBeUndefined();
    expect(dir("ce")).toBe("ltr");
    expect(dir("de")).toBe("ltr");
    expect(canonicalize("mde")).toBe("mde");
    expect(canonicalize("s")).toBeUndefined();
    expect(parents("cs")).toEqual([]);
  });

  it("keeps 1000 entries, then starts over (tags can come from user input)", () => {
    _resetLocaleCache();
    const pt = parents("pt-BR"); // 3 entries: its parents and two maximized tags
    for (let i = 4; i <= 1000; i++) canonicalize(`en-x-n${i}`);
    expect(parents("pt-BR")).toBe(pt);
    canonicalize("en-x-n1001");
    expect(parents("pt-BR")).not.toBe(pt);
    expect(parents("pt-BR")).toEqual(pt);
  });
});

describe("the shared memo rolling over", () => {
  it("a lookup whose own computation rolls the memo over still returns its value", () => {
    // 999 entries: the next `parents()` stores its maximize() results first, which caps the
    // memo and replaces it while the outer lookup is still computing.
    _resetLocaleCache();
    for (let i = 0; i < 999; i++) canonicalize("en-x-" + i.toString(36).padStart(2, "0"));
    expect(parents("sr-Latn-RS")).toEqual(["sr-Latn"]);
    expect(parents("sr-Latn-RS")).toEqual(["sr-Latn"]);
    _resetLocaleCache();
  });
});
