import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addBeforeProcessHook,
  createInvisibleCharPostProcessor,
  registerPostProcessorOnce,
} from "../src/postProcessor";
import { registerKey, encodeKeyToInvisible, loadKeyMappings } from "../src/translation";
import type { TranslationParams } from "@comvi/core";

describe("IncontextEditor Post-Processor", () => {
  beforeEach(() => {
    // Clear key mappings before each test
    loadKeyMappings({});
  });

  describe("Default behavior (without raw flag)", () => {
    it("should inject invisible characters into string results", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const result = postProcessor("Hello World", "greeting", "default", {});

      expect(result).not.toBe("Hello World");
      expect(result).toContain("Hello World");
      expect(result.length).toBeGreaterThan("Hello World".length);
    });

    it("should inject invisible characters into array results with string at end", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const result = postProcessor(["Hello", " ", "World"], "greeting", "default", {});

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result[2]).not.toBe("World");
      expect(result[2]).toContain("World");
    });

    it("should append invisible characters to array if last element is not string", () => {
      const mockVNode = { type: "span", children: "test" };
      const postProcessor = createInvisibleCharPostProcessor();
      const result = postProcessor(["Hello", mockVNode], "greeting", "default", {});

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(typeof result[2]).toBe("string");
    });

    it("should register keys and encode them correctly", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const key = "test.key";
      const ns = "custom";

      const result = postProcessor("Translation", key, ns, {});

      // Verify the key was registered and encoded
      const id = registerKey(key, ns);
      const expectedEncoding = encodeKeyToInvisible(id);

      expect(result).toContain(expectedEncoding);
    });

    it("should produce consistent encodings for the same key", () => {
      const postProcessor = createInvisibleCharPostProcessor();

      const result1 = postProcessor("Text", "same.key", "default", {});
      const result2 = postProcessor("Text", "same.key", "default", {});

      expect(result1).toBe(result2);
    });

    it("should produce different encodings for different keys", () => {
      const postProcessor = createInvisibleCharPostProcessor();

      const result1 = postProcessor("Text", "key1", "default", {});
      const result2 = postProcessor("Text", "key2", "default", {});

      expect(result1).not.toBe(result2);
    });
  });

  describe("With raw flag set to true", () => {
    it("should skip invisible character injection for string results", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };
      const result = postProcessor("Hello World", "greeting", "default", params);

      expect(result).toBe("Hello World");
    });

    it("should skip invisible character injection for array results", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };
      const input = ["Hello", " ", "World"];
      const result = postProcessor(input, "greeting", "default", params);

      expect(result).toBe(input);
      expect(result).toEqual(["Hello", " ", "World"]);
    });

    it("should skip injection for VNode arrays", () => {
      const mockVNode = { type: "span", children: "test" };
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };
      const input = ["Hello", mockVNode];
      const result = postProcessor(input, "greeting", "default", params);

      expect(result).toBe(input);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it("should not register keys when raw flag is set", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };

      // Clear mappings
      loadKeyMappings({});

      postProcessor("Translation", "skip.this.key", "default", params);

      // The key should still be registered (because registerKey is called before the check)
      // but the encoding should not be appended to the result
      const result = postProcessor("Translation", "skip.this.key", "default", params);
      expect(result).toBe("Translation");
    });
  });

  describe("With raw flag set to false (explicit)", () => {
    it("should inject invisible characters when raw is explicitly false", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: false };
      const result = postProcessor("Hello World", "greeting", "default", params);

      expect(result).not.toBe("Hello World");
      expect(result).toContain("Hello World");
    });
  });

  describe("With raw flag undefined (no params)", () => {
    it("should inject invisible characters when params is undefined", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const result = postProcessor("Hello World", "greeting", "default", undefined as any);

      expect(result).not.toBe("Hello World");
      expect(result).toContain("Hello World");
    });

    it("should inject invisible characters when params is empty object", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const result = postProcessor("Hello World", "greeting", "default", {});

      expect(result).not.toBe("Hello World");
      expect(result).toContain("Hello World");
    });
  });

  describe("Mixed params with raw flag", () => {
    it("should skip injection when raw is true along with other params", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = {
        raw: true,
        ns: "custom",
        locale: "en",
        custom: "value",
      };
      const result = postProcessor("Translation", "key", "default", params);

      expect(result).toBe("Translation");
    });

    it("should inject when raw is false along with other params", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = {
        raw: false,
        ns: "custom",
        locale: "en",
      };
      const result = postProcessor("Translation", "key", "default", params);

      expect(result).not.toBe("Translation");
      expect(result).toContain("Translation");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty string with raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };
      const result = postProcessor("", "empty", "default", params);

      expect(result).toBe("");
    });

    it("should handle empty string without raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const result = postProcessor("", "empty", "default", {});

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0); // Should have invisible chars
    });

    it("should handle empty array with raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };
      const result = postProcessor([], "empty", "default", params);

      expect(result).toEqual([]);
    });

    it("should handle empty array without raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const result = postProcessor([], "empty", "default", {});

      // Should append invisible chars as a new element
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Registration helpers", () => {
    it("should register post-processor only once per i18n instance", () => {
      const i18n = {
        registerPostProcessor: vi.fn(),
      };

      registerPostProcessorOnce(i18n as any);
      registerPostProcessorOnce(i18n as any);

      expect(i18n.registerPostProcessor).toHaveBeenCalledTimes(1);
    });

    it("should execute and cleanup beforeProcess hooks", () => {
      const i18n = {
        registerPostProcessor: vi.fn(),
      };
      const beforeProcessHook = vi.fn();

      const removeHook = addBeforeProcessHook(i18n as any, beforeProcessHook);
      registerPostProcessorOnce(i18n as any);

      const processor = i18n.registerPostProcessor.mock.calls[0]?.[0];
      expect(typeof processor).toBe("function");

      processor("Hello", "greeting", "default", {});
      expect(beforeProcessHook).toHaveBeenCalledTimes(1);

      removeHook();
      processor("Hello", "greeting", "default", {});
      expect(beforeProcessHook).toHaveBeenCalledTimes(1);
    });
  });
});
