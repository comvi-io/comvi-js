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

beforeEach(() => {
  resetEncoder();
});

describe("registerKey", () => {
  it("should assign sequential IDs to new keys", () => {
    const id1 = registerKey("key1");
    const id2 = registerKey("key2");
    const id3 = registerKey("key3");

    expect([id1, id2, id3]).toEqual([1, 2, 3]);
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

    expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("should handle empty string", () => {
    expect(registerKey("")).toBe(1);
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
    const encoded = encodeKeyToInvisible(registerKey(key));

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
    expect(decodeInvisibleToKey(encoded)).toBe(maxId);
  });

  it("should stop round-tripping past the 8-digit base-5 range (5^8 = 390,625)", () => {
    const encoded = encodeKeyToInvisible(390625);

    // 390625 needs 9 base-5 digits; the decoder reads the first 8-char window
    // and hands back a different id. Pinned as the documented ceiling.
    expect(encoded).toHaveLength(9);
    expect(decodeInvisibleToKey(encoded)).toBe(78125);
  });

  it("should pad small IDs with leading zeros", () => {
    const encoded = encodeKeyToInvisible(1);

    // \u200B is the zero digit in base-5.
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

  describe("edge cases", () => {
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
      const keys = ["key0", "key1", "key2"];
      const encodings = keys.map((key) => encodeKeyToInvisible(registerKey(key)));

      expect(new Set(encodings).size).toBe(keys.length);
      expect(encodings.map((encoded) => decodeInvisibleToKey(encoded))).toEqual(
        keys.map((key) => ({ key, ns: "default" })),
      );
    });
  });

  describe("invalid input", () => {
    it("should handle invalid encoding gracefully", () => {
      const decoded = decodeInvisibleToKey(INVALID_DATA.INVALID_BASE5);
      expect(decoded).toBeNull();
    });

    it("should handle too short encoding", () => {
      const decoded = decodeInvisibleToKey(INVALID_DATA.TOO_SHORT_ENCODING);
      expect(decoded).toBeNull();
    });

    it("should handle mixed valid/invalid characters", () => {
      const decoded = decodeInvisibleToKey(INVALID_DATA.MIXED_VALID_INVALID);
      expect(decoded).toBeNull();
    });
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

    const encoded1 = encodeKeyToInvisible(registerKey(key1));
    const encoded2 = encodeKeyToInvisible(registerKey(key2));

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
    const encoded = encodeKeyToInvisible(registerKey("test"));
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
    registerKey("key1");
    registerKey("key2");
    registerKey("key3");

    const mappings = getKeyMappings();

    loadKeyMappings({});
    loadKeyMappings(mappings);

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

    expect(mappings).toEqual({ "default:test1": 1, "default:test2": 2 });
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

    expect(ids).toEqual([id1, id2]);
  });

  it("should handle interleaved invisible characters", () => {
    const id = registerKey("interleaved");
    const encoded = encodeKeyToInvisible(id);

    const interleaved = encoded.split("").join("a");
    const ids = extractAllIds(interleaved);

    expect(ids).toEqual([id]);
  });

  it("should return empty array for text without IDs", () => {
    const ids = extractAllIds("No invisible characters here");
    expect(ids).toEqual([]);
  });
});

describe("Round-trip Encoding/Decoding", () => {
  it.each(["simple", "nested.key.path", "with_underscore", "with-dash", "123numeric", "MixedCase"])(
    "%s survives encode → decode",
    (key) => {
      const encoded = encodeKeyToInvisible(registerKey(key));

      expect(decodeInvisibleToKey(encoded)).toEqual({ key, ns: "default" });
    },
  );

  // One digit, a carry, the base-5 place boundary, and the top of the range.
  it.each([1, 5, 3125, 390624])("id %i survives encode → scan", (id) => {
    loadKeyMappings({});

    const keys = scanForInvisibleKeys(encodeKeyToInvisible(id));

    expect(keys).toEqual([id]);
  });
});
