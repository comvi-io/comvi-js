import { describe, it, expect, beforeEach } from "vitest";
import {
  encodeKeyToInvisible,
  decodeInvisibleToKey,
  scanForInvisibleKeys,
  containsInvisibleCharacters,
  registerKey,
  getKeyFromId,
  loadKeyMappings,
  getKeyMappings,
  extractAllIds,
  resetEncoder,
} from "../src/translation";
import { SAMPLE_KEYS, EDGE_CASES, INVALID_DATA } from "./fixtures";

describe("translation.ts - Encoding/Decoding System", () => {
  beforeEach(() => {
    resetEncoder();
  });
  describe("registerKey", () => {
    it("should assign sequential IDs to new keys", () => {
      const id1 = registerKey("key1");
      const id2 = registerKey("key2");
      const id3 = registerKey("key3");

      expect(id2).toBe(id1 + 1);
      expect(id3).toBe(id2 + 1);
    });

    it("should return same ID for duplicate key registration", () => {
      const id1 = registerKey(SAMPLE_KEYS.SIMPLE);
      const id2 = registerKey(SAMPLE_KEYS.SIMPLE);

      expect(id1).toBe(id2);
    });

    it("should handle different key formats", () => {
      const keys = [
        SAMPLE_KEYS.SIMPLE,
        SAMPLE_KEYS.NESTED,
        SAMPLE_KEYS.WITH_DOTS,
        SAMPLE_KEYS.SHORT,
        SAMPLE_KEYS.LONG,
        SAMPLE_KEYS.SPECIAL_CHARS,
      ];

      const ids = keys.map((key) => registerKey(key));
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(keys.length);
    });

    it("should handle empty string", () => {
      const id = registerKey("");
      expect(id).toBeGreaterThan(0);
    });
  });

  describe("getKeyFromId", () => {
    it("should retrieve registered key by ID", () => {
      const key = "test.key.lookup";
      const id = registerKey(key);
      const retrieved = getKeyFromId(id);

      expect(retrieved).toEqual({ key, ns: "default" });
    });

    it("should return null for non-existent ID", () => {
      const result = getKeyFromId(999999);
      expect(result).toBeNull();
    });

    it("should return null for invalid ID", () => {
      expect(getKeyFromId(0)).toBeNull();
      expect(getKeyFromId(-1)).toBeNull();
    });
  });

  describe("encodeKeyToInvisible", () => {
    it("should encode string key to 8-character invisible sequence", () => {
      const key = "home.title";
      const encoded = encodeKeyToInvisible(key);

      expect(encoded).toHaveLength(8);
      expect(encoded).toContainInvisibleChars();
    });

    it("should encode numeric ID directly", () => {
      const encoded1 = encodeKeyToInvisible(1);
      const encoded2 = encodeKeyToInvisible(100);

      expect(encoded1).toHaveLength(8);
      expect(encoded2).toHaveLength(8);
      expect(encoded1).not.toBe(encoded2);
    });

    it("should produce different encodings for different keys", () => {
      const id1 = registerKey("key1");
      const id2 = registerKey("key2");
      const encoded1 = encodeKeyToInvisible(id1);
      const encoded2 = encodeKeyToInvisible(id2);

      expect(encoded1).not.toBe(encoded2);
    });

    it("should produce same encoding for same key", () => {
      const key = "consistent.key";
      const id = registerKey(key);
      const encoded1 = encodeKeyToInvisible(id);
      const encoded2 = encodeKeyToInvisible(id);

      expect(encoded1).toBe(encoded2);
    });

    it("should handle maximum safe ID (5^8 - 1 = 390,624)", () => {
      const maxId = 390624;
      const encoded = encodeKeyToInvisible(maxId);

      expect(encoded).toHaveLength(8);
      expect(encoded).toContainInvisibleChars();
    });

    it("should pad small IDs with leading zeros", () => {
      const encoded = encodeKeyToInvisible(1);

      // First 7 characters should be zero-width space (\u200B - the zero in base-5)
      expect(encoded.substring(0, 7)).toBe("\u200B".repeat(7));
    });
  });

  describe("decodeInvisibleToKey", () => {
    it("should decode invisible characters back to original key", () => {
      const originalKey = "decode.test";
      const id = registerKey(originalKey);
      const encoded = encodeKeyToInvisible(id);
      const decoded = decodeInvisibleToKey(encoded);

      expect(decoded).toEqual({ key: originalKey, ns: "default" });
    });

    it("should decode numeric ID", () => {
      const id = 42;
      const encoded = encodeKeyToInvisible(id);
      const decoded = decodeInvisibleToKey(encoded);

      expect(decoded).toBe(id);
    });

    it("should extract key from text with invisible chars", () => {
      const key = "embedded.key";
      const id = registerKey(key);
      const encoded = encodeKeyToInvisible(id);
      const text = `Some visible text ${encoded} more text`;
      const decoded = decodeInvisibleToKey(text);

      expect(decoded).toEqual({ key, ns: "default" });
    });

    it("should return null for text without invisible chars", () => {
      const decoded = decodeInvisibleToKey("Plain text without encoding");
      expect(decoded).toBeNull();
    });

    it("should return null for empty string", () => {
      const decoded = decodeInvisibleToKey("");
      expect(decoded).toBeNull();
    });

    it("should handle text with partial invisible sequence", () => {
      const partial = "\u200B\u200C\u200D"; // Only 3 chars, not 8
      const decoded = decodeInvisibleToKey(partial);

      expect(decoded).toBeNull();
    });
  });

  describe("scanForInvisibleKeys", () => {
    it("should find single encoded key in text", () => {
      const key = "single.key";
      const id = registerKey(key);
      const encoded = encodeKeyToInvisible(id);
      const text = `Text with ${encoded} embedded key`;
      const keys = scanForInvisibleKeys(text);

      expect(keys).toHaveLength(1);
      expect(keys[0]).toEqual({ key, ns: "default" });
    });

    it("should find multiple encoded keys in text", () => {
      const key1 = "first.key";
      const key2 = "second.key";
      const key3 = "third.key";

      const id1 = registerKey(key1);
      const id2 = registerKey(key2);
      const id3 = registerKey(key3);

      const encoded1 = encodeKeyToInvisible(id1);
      const encoded2 = encodeKeyToInvisible(id2);
      const encoded3 = encodeKeyToInvisible(id3);

      const text = `${encoded1} some text ${encoded2} more ${encoded3}`;
      const keys = scanForInvisibleKeys(text);

      expect(keys).toHaveLength(3);
      expect(keys).toContainEqual({ key: key1, ns: "default" });
      expect(keys).toContainEqual({ key: key2, ns: "default" });
      expect(keys).toContainEqual({ key: key3, ns: "default" });
    });

    it("should find consecutive keys without visible text between", () => {
      const key1 = "consecutive1";
      const key2 = "consecutive2";

      const encoded1 = encodeKeyToInvisible(key1);
      const encoded2 = encodeKeyToInvisible(key2);

      const text = `${encoded1}${encoded2}`;
      const keys = scanForInvisibleKeys(text);

      expect(keys).toHaveLength(2);
    });

    it("should return empty array for text without keys", () => {
      const keys = scanForInvisibleKeys("Plain text without any encoding");
      expect(keys).toEqual([]);
    });

    it("should handle empty string", () => {
      const keys = scanForInvisibleKeys("");
      expect(keys).toEqual([]);
    });
  });

  describe("containsInvisibleCharacters", () => {
    it("should detect invisible characters", () => {
      const encoded = encodeKeyToInvisible("test");
      expect(containsInvisibleCharacters(encoded)).toBe(true);
    });

    it("should detect individual invisible chars", () => {
      expect(containsInvisibleCharacters("\u200B")).toBe(true);
      expect(containsInvisibleCharacters("\u200D")).toBe(true);
      expect(containsInvisibleCharacters("\u200C")).toBe(true);
      expect(containsInvisibleCharacters("\u2063")).toBe(true);
      expect(containsInvisibleCharacters("\u2064")).toBe(true);
    });

    it("should detect invisible chars mixed with visible text", () => {
      const text = `Normal text \u200B with invisible`;
      expect(containsInvisibleCharacters(text)).toBe(true);
    });

    it("should return false for plain text", () => {
      expect(containsInvisibleCharacters("Plain text")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(containsInvisibleCharacters("")).toBe(false);
    });

    it("should return false for other Unicode characters", () => {
      expect(containsInvisibleCharacters(EDGE_CASES.UNICODE)).toBe(false);
    });
  });

  describe("loadKeyMappings / getKeyMappings", () => {
    it("should save and load key mappings", () => {
      // Register some keys
      registerKey("key1");
      registerKey("key2");
      registerKey("key3");

      // Get current mappings
      const mappings = getKeyMappings();

      // Clear and reload
      loadKeyMappings({});
      loadKeyMappings(mappings);

      // Verify mappings restored
      const reloadedMappings = getKeyMappings();
      expect(reloadedMappings).toEqual(mappings);
    });

    it("should preserve highest ID when loading", () => {
      const mappings = {
        key1: 10,
        key2: 20,
        key3: 30,
      };

      loadKeyMappings(mappings);

      // Next registered key should get ID 31
      const newId = registerKey("key4");
      expect(newId).toBe(31);
    });

    it("should clear existing mappings when loading", () => {
      registerKey("old.key");

      const newMappings = {
        "new.key": 1,
      };

      loadKeyMappings(newMappings);

      const loaded = getKeyMappings();
      expect(loaded).toEqual(newMappings);
      expect(loaded).not.toHaveProperty("old.key");
    });

    it("should handle empty mappings", () => {
      loadKeyMappings({});
      const mappings = getKeyMappings();

      expect(mappings).toEqual({});
    });

    it("should return current mappings as object", () => {
      registerKey("test1");
      registerKey("test2");

      const mappings = getKeyMappings();

      expect(typeof mappings).toBe("object");
      expect(mappings).toHaveProperty("default:test1");
      expect(mappings).toHaveProperty("default:test2");
    });
  });

  describe("extractAllIds", () => {
    it("should extract all encoded IDs from text", () => {
      const id1 = registerKey("extract1");
      const id2 = registerKey("extract2");

      const encoded1 = encodeKeyToInvisible(id1);
      const encoded2 = encodeKeyToInvisible(id2);

      const text = `${encoded1} mixed ${encoded2}`;
      const ids = extractAllIds(text);

      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });

    it("should handle interleaved invisible characters", () => {
      const id = registerKey("interleaved");
      const encoded = encodeKeyToInvisible(id);

      // Mix visible chars within invisible encoding
      const interleaved = encoded.split("").join("a");
      const ids = extractAllIds(interleaved);

      expect(ids).toContain(id);
    });

    it("should return empty array for text without IDs", () => {
      const ids = extractAllIds("No invisible characters here");
      expect(ids).toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very long keys", () => {
      const longKey = "a".repeat(1000);
      const id = registerKey(longKey);
      const encoded = encodeKeyToInvisible(id);
      const decoded = decodeInvisibleToKey(encoded);

      expect(decoded).toEqual({ key: longKey, ns: "default" });
    });

    it("should handle keys with special characters", () => {
      const specialKey = "key_with-special.chars:123";
      const id = registerKey(specialKey);
      const encoded = encodeKeyToInvisible(id);
      const decoded = decodeInvisibleToKey(encoded);

      expect(decoded).toEqual({ key: specialKey, ns: "default" });
    });

    it("should handle Unicode keys", () => {
      const unicodeKey = "🌍 hello 你好";
      const id = registerKey(unicodeKey);
      const encoded = encodeKeyToInvisible(id);
      const decoded = decodeInvisibleToKey(encoded);

      expect(decoded).toEqual({ key: unicodeKey, ns: "default" });
    });

    it("should handle whitespace in text around encoding", () => {
      const key = "whitespace.test";
      const id = registerKey(key);
      const encoded = encodeKeyToInvisible(id);
      const text = `   ${encoded}   `;
      const decoded = decodeInvisibleToKey(text);

      expect(decoded).toEqual({ key, ns: "default" });
    });

    it("should not confuse similar invisible char sequences", () => {
      // Create keys that might have similar base-5 representations
      const keys = Array.from({ length: 10 }, (_, i) => `key${i}`);
      const ids = keys.map((k) => registerKey(k)); // Register each key
      const encodings = ids.map((id) => encodeKeyToInvisible(id)); // Encode IDs

      // All encodings should be unique
      const uniqueEncodings = new Set(encodings);
      expect(uniqueEncodings.size).toBe(keys.length);

      // All should decode correctly
      encodings.forEach((encoded, i) => {
        const decoded = decodeInvisibleToKey(encoded);
        expect(decoded).toEqual({ key: keys[i], ns: "default" });
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid encoding gracefully", () => {
      const decoded = decodeInvisibleToKey(INVALID_DATA.INVALID_BASE5);
      // Should not throw, might return null or a number
      expect(decoded === null || typeof decoded === "number").toBe(true);
    });

    it("should handle too short encoding", () => {
      const decoded = decodeInvisibleToKey(INVALID_DATA.TOO_SHORT_ENCODING);
      expect(decoded).toBeNull();
    });

    it("should handle mixed valid/invalid characters", () => {
      const decoded = decodeInvisibleToKey(INVALID_DATA.MIXED_VALID_INVALID);
      // Should not throw
      expect(decoded !== undefined).toBe(true);
    });
  });

  describe("Round-trip Encoding/Decoding", () => {
    it("should maintain data integrity through encode/decode cycle", () => {
      const testKeys = [
        "simple",
        "nested.key.path",
        "with_underscore",
        "with-dash",
        "123numeric",
        "MixedCase",
      ];

      testKeys.forEach((key) => {
        const id = registerKey(key); // Register key to get ID
        const encoded = encodeKeyToInvisible(id); // Encode the ID
        const decoded = decodeInvisibleToKey(encoded); // Decode returns {key, ns} or number
        expect(decoded).toEqual({ key, ns: "default" }); // Should return object with key and namespace
      });
    });

    it("should handle sequential IDs correctly", () => {
      // Clear mappings first
      loadKeyMappings({});

      // Register IDs and verify round-trip
      for (let i = 1; i <= 100; i++) {
        const encoded = encodeKeyToInvisible(i);
        const keys = scanForInvisibleKeys(encoded);
        // scanForInvisibleKeys returns the ID if no key is registered for it
        expect(keys[0]).toBe(i);
      }
    });
  });
});
