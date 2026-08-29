import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addBeforeProcessHook,
  createInvisibleCharPostProcessor,
  registerPostProcessorOnce,
} from "../src/postProcessor";
import { getKeyMappings, loadKeyMappings } from "../src/translation";
import type { TranslationParams } from "@comvi/core";

// `loadKeyMappings({})` in beforeEach restarts the id sequence, so the first key
// a test registers is id 1 and the second is id 2. These are those two ids as
// 8 base-5 digits in the INVISIBLE_CHARS alphabet (index 0/1/2 = \u200B/\u200D/\u200C).
const ENCODED_ID_1 = "\u200B".repeat(7) + "\u200D";
const ENCODED_ID_2 = "\u200B".repeat(7) + "\u200C";

describe("createInvisibleCharPostProcessor()", () => {
  beforeEach(() => {
    loadKeyMappings({});
  });

  it("should append the key's invisible encoding to a string result", () => {
    const postProcessor = createInvisibleCharPostProcessor();

    const result = postProcessor("Hello World", "greeting", "default", {});

    expect(result).toBe("Hello World" + ENCODED_ID_1);
    expect(result).toContainInvisibleChars();
  });

  it.each([
    ["an empty params object", {} as TranslationParams],
    ["no params at all", undefined as unknown as TranslationParams],
    ["raw: false", { raw: false } as TranslationParams],
    ["raw: false alongside other params", { raw: false, ns: "custom", locale: "en" }],
  ])("should inject the encoding with %s", (_label, params) => {
    const postProcessor = createInvisibleCharPostProcessor();

    const result = postProcessor("Hello World", "greeting", "default", params);

    expect(result).toBe("Hello World" + ENCODED_ID_1);
  });

  it("should append the encoding to the last string element of an array result", () => {
    const postProcessor = createInvisibleCharPostProcessor();

    const result = postProcessor(["Hello", " ", "World"], "greeting", "default", {});

    expect(result).toEqual(["Hello", " ", "World" + ENCODED_ID_1]);
  });

  it("should append the encoding as a new element when the array ends in a VNode", () => {
    const mockVNode = { type: "span", children: "test" };
    const postProcessor = createInvisibleCharPostProcessor();

    const result = postProcessor(["Hello", mockVNode], "greeting", "default", {});

    expect(result).toEqual(["Hello", mockVNode, ENCODED_ID_1]);
  });

  it("should register the key under its namespace and append that key's encoding", () => {
    const postProcessor = createInvisibleCharPostProcessor();

    const result = postProcessor("Translation", "test.key", "custom", {});

    expect(getKeyMappings()).toEqual({ "custom:test.key": 1 });
    expect(result).toBe("Translation" + ENCODED_ID_1);
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

    expect(result1).toBe("Text" + ENCODED_ID_1);
    expect(result2).toBe("Text" + ENCODED_ID_2);
  });

  it("should return a result that is neither a string nor an array untouched", () => {
    const postProcessor = createInvisibleCharPostProcessor();
    const vnode = { type: "span", children: "test" };

    expect(postProcessor(vnode as never, "greeting", "default", {})).toBe(vnode);
  });

  describe("raw: true", () => {
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
    });

    it("should not register the key when raw flag is set", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };

      postProcessor("Translation", "skip.this.key", "default", params);

      expect(getKeyMappings()).toEqual({});
    });

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

    it("should handle empty string with raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };

      const result = postProcessor("", "empty", "default", params);

      expect(result).toBe("");
    });

    it("should handle empty array with raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();
      const params: TranslationParams = { raw: true };

      const result = postProcessor([], "empty", "default", params);

      expect(result).toEqual([]);
    });
  });

  describe("empty results", () => {
    it("should handle empty string without raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();

      const result = postProcessor("", "empty", "default", {});

      expect(result).toBe(ENCODED_ID_1);
    });

    it("should handle empty array without raw flag", () => {
      const postProcessor = createInvisibleCharPostProcessor();

      const result = postProcessor([], "empty", "default", {});

      expect(result).toEqual([ENCODED_ID_1]);
    });
  });
});

describe("registerPostProcessorOnce()", () => {
  beforeEach(() => {
    loadKeyMappings({});
  });

  it("should register post-processor only once per i18n instance", () => {
    const first = { registerPostProcessor: vi.fn() };
    const second = { registerPostProcessor: vi.fn() };

    registerPostProcessorOnce(first as never);
    registerPostProcessorOnce(first as never);
    registerPostProcessorOnce(second as never);

    expect(first.registerPostProcessor).toHaveBeenCalledTimes(1);
    expect(second.registerPostProcessor).toHaveBeenCalledTimes(1);
  });
});

describe("addBeforeProcessHook()", () => {
  beforeEach(() => {
    loadKeyMappings({});
  });

  it("should execute and cleanup beforeProcess hooks", () => {
    const i18n = { registerPostProcessor: vi.fn() };
    const beforeProcessHook = vi.fn();

    const removeHook = addBeforeProcessHook(i18n as never, beforeProcessHook);
    registerPostProcessorOnce(i18n as never);

    const processor = i18n.registerPostProcessor.mock.calls[0]![0];
    processor("Hello", "greeting", "default", {});
    expect(beforeProcessHook).toHaveBeenCalledTimes(1);

    removeHook();
    processor("Hello", "greeting", "default", {});
    expect(beforeProcessHook).toHaveBeenCalledTimes(1);
  });

  it("should run every registered hook and remove only the one asked for", () => {
    const i18n = { registerPostProcessor: vi.fn() };
    const first = vi.fn();
    const second = vi.fn();

    const removeFirst = addBeforeProcessHook(i18n as never, first);
    addBeforeProcessHook(i18n as never, second);
    registerPostProcessorOnce(i18n as never);
    const processor = i18n.registerPostProcessor.mock.calls[0]![0];

    processor("Hello", "greeting", "default", {});
    removeFirst();
    removeFirst();
    processor("Hello", "greeting", "default", {});

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
