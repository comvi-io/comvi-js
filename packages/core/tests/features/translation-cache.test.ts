import { describe, it, expect } from "vitest";
import { TranslationCache } from "../../src";

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

  it("tracks size, languages and keys across set/delete operations", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    cache.set("en", "admin", { title: "Admin" });
    cache.set("fr", "default", { hello: "Bonjour" });

    expect(cache.size).toBe(3);
    expect(cache.getLocales().sort()).toEqual(["en", "fr"]);
    expect(Array.from(cache.keys()).sort()).toEqual(["en:admin", "en:default", "fr:default"]);

    cache.delete("en", "admin");
    expect(cache.size).toBe(2);
    expect(cache.has("en", "admin")).toBe(false);
    expect(cache.getLocales().sort()).toEqual(["en", "fr"]);

    cache.delete("fr");
    expect(cache.size).toBe(1);
    expect(cache.getLocales()).toEqual(["en"]);
    expect(Array.from(cache.keys())).toEqual(["en:default"]);
  });

  it("returns a flat locale:namespace map via clone()", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    expect(cache.clone().get("en:default")).toEqual({ hello: "Hello" });

    cache.set("fr", "default", { hello: "Bonjour" });
    expect(cache.clone().get("fr:default")).toEqual({ hello: "Bonjour" });

    cache.delete("en", "default");
    expect(cache.clone().has("en:default")).toBe(false);
    expect(cache.clone().has("fr:default")).toBe(true);

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

  it("getInternalMap() returns a new readonly snapshot after a mutation", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    const snapshot1 = cache.getInternalMap();

    cache.set("fr", "default", { bonjour: "Bonjour" });
    const snapshot2 = cache.getInternalMap();

    expect(snapshot1).not.toBe(snapshot2);
    expect(Array.from(snapshot2.keys()).sort()).toEqual(["en:default", "fr:default"]);
  });

  it("mutating a clone does not poison future clone(), keys(), or getInternalMap() calls", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    cache.set("fr", "default", { bonjour: "Bonjour" });

    const cloned = cache.clone();
    cloned.delete("en:default");
    cloned.set("de:default", { hallo: "Hallo" });

    expect(Array.from(cache.clone().keys()).sort()).toEqual(["en:default", "fr:default"]);
    expect(Array.from(cache.keys()).sort()).toEqual(["en:default", "fr:default"]);
    expect(Array.from(cache.getInternalMap().keys()).sort()).toEqual(["en:default", "fr:default"]);
  });

  it("exposes a readonly internal snapshot", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    const snapshot = cache.getInternalMap() as ReadonlyMap<string, unknown> & {
      set?: unknown;
      delete?: unknown;
      clear?: unknown;
    };

    expect(snapshot.get("en:default")).toEqual({ hello: "Hello" });
    expect(snapshot.set).toBeUndefined();
    expect(snapshot.delete).toBeUndefined();
    expect(snapshot.clear).toBeUndefined();
  });

  it("mutating the cloned Map does not corrupt get/has/size lookups on the cache", () => {
    const cache = new TranslationCache();

    cache.set("en", "default", { hello: "Hello" });
    cache.set("fr", "default", { bonjour: "Bonjour" });

    const cloned = cache.clone();
    cloned.delete("en:default");
    cloned.set("de:default", { hallo: "Hallo" });

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

  it("increments revision on mutations and keeps it stable on reads", () => {
    const cache = new TranslationCache();
    const initialRevision = cache.getRevision();
    expect(initialRevision).toBe(0);

    cache.set("en", "default", { hello: "Hello" });
    const afterSet = cache.getRevision();
    expect(afterSet).toBe(initialRevision + 1);

    cache.get("en", "default");
    cache.has("en", "default");
    cache.clone();
    cache.getInternalMap();
    expect(cache.getRevision()).toBe(afterSet);

    cache.delete("en", "default");
    const afterDelete = cache.getRevision();
    expect(afterDelete).toBe(afterSet + 1);

    cache.clear();
    expect(cache.getRevision()).toBe(afterDelete + 1);
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
});
