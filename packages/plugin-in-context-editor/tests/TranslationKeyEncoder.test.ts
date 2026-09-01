import { describe, it, expect, beforeEach } from "vitest";
import { TranslationKeyEncoder } from "../src/encoding/TranslationKeyEncoder";

describe("TranslationKeyEncoder", () => {
  let encoder: TranslationKeyEncoder;

  beforeEach(() => {
    encoder = new TranslationKeyEncoder();
  });

  describe("registerKey()", () => {
    it("files a key registered without a namespace under 'default'", () => {
      const id = encoder.registerKey("home.title");

      expect(encoder.getKeyFromId(id)).toEqual({ key: "home.title", ns: "default" });
    });

    it("keeps the namespace given explicitly", () => {
      const id = encoder.registerKey("total", "checkout");

      expect(encoder.getKeyFromId(id)).toEqual({ key: "total", ns: "checkout" });
    });
  });

  describe("getKeyFromId()", () => {
    it("reports 'default' for a loaded mapping whose key carries no namespace prefix", () => {
      encoder.loadMappings({ "legacy.key": 7 });

      expect(encoder.getKeyFromId(7)).toEqual({ key: "legacy.key", ns: "default" });
    });

    it("splits on the first colon so keys may contain further colons", () => {
      encoder.loadMappings({ "checkout:cart:total": 3 });

      expect(encoder.getKeyFromId(3)).toEqual({ key: "cart:total", ns: "checkout" });
    });
  });

  describe("loadMappings()", () => {
    it("makes each loaded id resolvable back to its key", () => {
      encoder.loadMappings({ "checkout:total": 4 });

      expect(encoder.getKeyFromId(4)).toEqual({ key: "total", ns: "checkout" });
    });

    it("makes the ids of the previous mapping set unresolvable", () => {
      encoder.loadMappings({ "default:old": 1 });
      encoder.loadMappings({ "default:new": 2 });

      expect(encoder.getKeyFromId(1)).toBeNull();
    });
  });

  describe("reset()", () => {
    it("makes a previously registered id unresolvable", () => {
      const id = encoder.registerKey("home.title", "default");

      encoder.reset();

      expect(encoder.getKeyFromId(id)).toBeNull();
    });
  });
});
