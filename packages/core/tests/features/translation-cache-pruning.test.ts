import { describe, it, expect } from "vitest";
import { TranslationCache } from "../../src";

describe("new TranslationCache() without options", () => {
  it('resolves a namespace-less get() against the "default" namespace', () => {
    const cache = new TranslationCache();
    cache.set("en", "default", { greeting: "Hello" });

    expect(cache.get("en")).toEqual({ greeting: "Hello" });
  });
});

describe("TranslationCache#delete(locale, namespace)", () => {
  it("drops the locale once its last namespace is gone", () => {
    const cache = new TranslationCache();
    cache.set("en", "nav", { home: "Home" });

    cache.delete("en", "nav");

    expect(cache.getLocales()).toEqual([]);
  });

  it("keeps the locale while another namespace remains", () => {
    const cache = new TranslationCache();
    cache.set("en", "nav", { home: "Home" });
    cache.set("en", "footer", { legal: "Legal" });

    cache.delete("en", "nav");

    expect(cache.getLocales()).toEqual(["en"]);
  });
});
