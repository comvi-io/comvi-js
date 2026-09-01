import { describe, it, expect } from "vitest";
import { TranslationCache } from "../../src";

/** Two locales set, plus a clone that has been mutated away from the cache. */
function cacheWithMutatedClone() {
  const cache = new TranslationCache();
  cache.set("en", "default", { hello: "Hello" });
  cache.set("fr", "default", { bonjour: "Bonjour" });

  const cloned = cache.clone();
  cloned.delete("en:default");
  cloned.set("de:default", { hallo: "Hallo" });

  return cache;
}

/** Two locales, one of them with two namespaces. */
function threeEntries() {
  const cache = new TranslationCache();
  cache.set("en", "default", { hello: "Hello" });
  cache.set("en", "admin", { title: "Admin" });
  cache.set("fr", "default", { hello: "Bonjour" });
  return cache;
}

describe("TranslationCache", () => {
  it("uses configured default namespace for get/has", () => {
    const cache = new TranslationCache({ defaultNs: "common" });
    const common = { greeting: "Hello" };

    cache.set("en", "common", common);

    expect(cache.get("en")).toBe(common);
    expect(cache.has("en")).toBe(true);
    expect(cache.get("en", "common")).toBe(common);
    expect(cache.has("en", "common")).toBe(true);
  });

  it("tracks size, locales and keys after a bulk set", () => {
    const cache = threeEntries();

    expect(cache.size).toBe(3);
    expect(cache.getLocales().sort()).toEqual(["en", "fr"]);
    expect(Array.from(cache.keys()).sort()).toEqual(["en:admin", "en:default", "fr:default"]);
  });

  it("drops one namespace from size and keys on delete(locale, namespace)", () => {
    const cache = threeEntries();

    cache.delete("en", "admin");

    expect(cache.size).toBe(2);
    expect(cache.has("en", "admin")).toBe(false);
    expect(Array.from(cache.keys()).sort()).toEqual(["en:default", "fr:default"]);
  });

  it("drops every namespace of the locale on delete(locale)", () => {
    const cache = threeEntries();

    cache.delete("fr");

    expect(cache.size).toBe(2);
    expect(cache.getLocales()).toEqual(["en"]);
    expect(Array.from(cache.keys()).sort()).toEqual(["en:admin", "en:default"]);
  });

  it("clone() keys an entry by locale:namespace", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });

    expect(cache.clone().get("en:default")).toEqual({ hello: "Hello" });
  });

  it("clone() picks up a locale added after an earlier clone", () => {
    const cache = new TranslationCache();
    cache.set("en", "default", { hello: "Hello" });
    cache.clone();

    cache.set("fr", "default", { hello: "Bonjour" });

    expect(cache.clone().get("fr:default")).toEqual({ hello: "Bonjour" });
  });

  it("clone() drops an entry deleted from the cache and keeps the rest", () => {
    const cache = new TranslationCache();
    cache.set("en", "default", { hello: "Hello" });
    cache.set("fr", "default", { hello: "Bonjour" });

    cache.delete("en", "default");

    expect(cache.clone().has("en:default")).toBe(false);
    expect(cache.clone().has("fr:default")).toBe(true);
  });

  it("clone() is empty after clear()", () => {
    const cache = new TranslationCache();
    cache.set("en", "default", { hello: "Hello" });

    cache.clear();

    expect(cache.clone().size).toBe(0);
  });

  it("getInternalMap() returns the same reference when revision has not changed", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });

    const snapshot1 = cache.getInternalMap();
    const snapshot2 = cache.getInternalMap();

    expect(snapshot1).toBe(snapshot2);
  });

  it("clone() returns a fresh copy on each call", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    const clone1 = cache.clone();
    const clone2 = cache.clone();

    expect(clone1).not.toBe(clone2);
    expect(clone1).toEqual(clone2);
  });

  it("getInternalMap() returns a new snapshot after a mutation", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    const snapshot1 = cache.getInternalMap();

    cache.set("fr", "default", { bonjour: "Bonjour" });
    const snapshot2 = cache.getInternalMap();

    expect(snapshot1).not.toBe(snapshot2);
    expect(Array.from(snapshot2.keys()).sort()).toEqual(["en:default", "fr:default"]);
  });

  it("mutating a clone does not poison future clone(), keys(), or getInternalMap() calls", () => {
    const cache = cacheWithMutatedClone();

    expect(Array.from(cache.clone().keys()).sort()).toEqual(["en:default", "fr:default"]);
    expect(Array.from(cache.keys()).sort()).toEqual(["en:default", "fr:default"]);
    expect(Array.from(cache.getInternalMap().keys()).sort()).toEqual(["en:default", "fr:default"]);
  });

  it("getInternalMap() exposes the current entries", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    const snapshot = cache.getInternalMap();

    expect(snapshot.get("en:default")).toEqual({ hello: "Hello" });
    expect(snapshot.size).toBe(1);
  });

  it("mutating the cloned Map does not corrupt get/has/size lookups on the cache", () => {
    const cache = cacheWithMutatedClone();

    expect(cache.get("en", "default")).toEqual({ hello: "Hello" });
    expect(cache.get("fr", "default")).toEqual({ bonjour: "Bonjour" });
    expect(cache.has("en", "default")).toBe(true);
    expect(cache.has("de", "default")).toBe(false);
    expect(cache.size).toBe(2);
    expect(cache.getLocales().sort()).toEqual(["en", "fr"]);
  });

  it("set() called twice for same locale:namespace pair does not double-increment size", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    expect(cache.size).toBe(1);

    cache.set("en", "default", { hello: "Hello Updated" });
    expect(cache.size).toBe(1);
  });

  it("increments the revision once per set, delete and clear, in that sequence", () => {
    const cache = new TranslationCache();
    expect(cache.getRevision()).toBe(0);

    cache.set("en", "default", { hello: "Hello" });
    expect(cache.getRevision()).toBe(1);

    cache.delete("en", "default");
    expect(cache.getRevision()).toBe(2);

    cache.clear();

    expect(cache.getRevision()).toBe(3);
  });

  it("keeps the revision stable across get, has, clone and getInternalMap", () => {
    const cache = new TranslationCache();
    cache.set("en", "default", { hello: "Hello" });

    cache.get("en", "default");
    cache.has("en", "default");
    cache.clone();
    cache.getInternalMap();

    expect(cache.getRevision()).toBe(1);
  });

  it("clone() reflects merged updates without reusing mutated snapshots", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    const firstClone = cache.clone();
    cache.set("en", "default", { hello: "Hello Updated" });
    const secondClone = cache.clone();

    expect(firstClone).not.toBe(secondClone);
    expect(firstClone.get("en:default")).toEqual({ hello: "Hello" });
    expect(secondClone.get("en:default")).toEqual({ hello: "Hello Updated" });
  });

  it("get()/has() return undefined/false for an absent locale or namespace", () => {
    const cache = new TranslationCache();
    cache.set("en", "default", { hello: "Hello" });

    expect(cache.get("zz")).toBeUndefined();
    expect(cache.get("en", "nope")).toBeUndefined();
    expect(cache.has("zz")).toBe(false);
    expect(cache.has("en", "nope")).toBe(false);
  });

  it("delete() for an absent locale or namespace leaves the entries untouched", () => {
    const cache = new TranslationCache();
    cache.set("en", "default", { hello: "Hello" });

    cache.delete("zz");
    cache.delete("en", "nope");

    expect(cache.size).toBe(1);
    expect(Array.from(cache.keys())).toEqual(["en:default"]);
  });
});
