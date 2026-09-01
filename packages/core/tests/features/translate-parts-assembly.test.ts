import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createI18n } from "../../src";
import { createI18n as createFullI18n } from "../../src/core/full";
import { clearTemplateCache } from "../../src/core/translate";
import { TK_PLURAL } from "../../src/core/translate/cache";
import {
  _resetSyntaxExtensions,
  registerSyntaxExtension,
  type MessageCompiler,
} from "../../src/core/translate/syntax";
import { createElement } from "../../src/virtualNode";
import { MARK, makeMarkExtension } from "../helpers/extensions";

// The part list IS the public shape of `tRaw()`, so a stray empty string is a contract break.

const node = createElement("b", {}, ["bold"]);

function renderRaw(template: string, params?: Record<string, unknown>) {
  return createI18n({ locale: "en", translation: { en: { msg: template } } }).tRaw(
    "msg" as never,
    params as never,
  );
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

describe("array parameters", () => {
  it("renders the items in order and skips null and undefined holes", () => {
    expect(renderRaw("{items}", { items: ["a", null, "b", undefined, "c"] })).toBe("abc");
  });

  it("carries a node item through and keeps the surrounding strings merged", () => {
    expect(renderRaw("[{items}]", { items: ["a", node, "b"] })).toEqual(["[a", node, "b]"]);
  });

  it("coerces a non-node object item with String()", () => {
    expect(renderRaw("{items}", { items: [{ k: 1 }] })).toBe("[object Object]");
  });
});

describe("a missing parameter next to a node parameter", () => {
  it("renders the placeholder under missingParam: literal", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "{node}{absent}" } },
    });

    expect(i18n.tRaw("msg" as never, { node } as never)).toEqual([node, "{absent}"]);
  });

  it("renders nothing under missingParam: drop", () => {
    const i18n = createI18n({
      locale: "en",
      missingParam: "drop",
      translation: { en: { msg: "{node}{absent}" } },
    });

    expect(i18n.tRaw("msg" as never, { node } as never)).toEqual([node]);
  });
});

describe("an empty-string parameter before a node parameter", () => {
  it("contributes no part of its own", () => {
    expect(renderRaw("{empty}{node}", { empty: "", node })).toEqual([node]);
  });
});

describe("a parameter beside a compiler argument token", () => {
  it("interpolates the parameter that follows a plural", () => {
    const i18n = createFullI18n({
      locale: "en",
      translation: { en: { msg: "{n, plural, one{one} other{many}} for {who}" } },
    });

    expect(i18n.t("msg", { n: 2, who: "Ann" })).toBe("many for Ann");
  });

  it("interpolates a present parameter that follows a plural under missingParam: drop", () => {
    const i18n = createFullI18n({
      locale: "en",
      missingParam: "drop",
      translation: { en: { msg: "{n, plural, one{one} other{many}} for {who}" } },
    });

    expect(i18n.t("msg", { n: 2, who: "Ann" })).toBe("many for Ann");
  });

  it("renders an argument token as empty when its compiler has no processArgToken", () => {
    const argOnlyCompiler: MessageCompiler = {
      makeArgToken: (content) => [TK_PLURAL, content, ""],
    };
    const i18n = createI18n({
      locale: "en",
      compiler: argOnlyCompiler,
      translation: { en: { msg: "a{x}b" } },
    });

    expect(i18n.t("msg" as never)).toBe("ab");
  });
});

describe("syntax-extension dispatch", () => {
  it("renders nothing for a token whose only extension declines it", () => {
    registerSyntaxExtension(makeMarkExtension({ id: "declines", cacheBit: 4, result: undefined }));

    expect(renderRaw(`a${MARK}b`)).toBe("ab");
  });

  it("passes a declined token to the next registered extension", () => {
    registerSyntaxExtension(makeMarkExtension({ id: "declines", cacheBit: 4, result: undefined }));
    registerSyntaxExtension(makeMarkExtension({ id: "claims", cacheBit: 8, result: "X" }));

    expect(renderRaw(`a${MARK}b`)).toBe("aXb");
  });

  it("merges a string result into the neighbouring text rather than pushing a part", () => {
    registerSyntaxExtension(makeMarkExtension({ id: "claims", cacheBit: 4, result: "X" }));

    expect(renderRaw(`a${MARK}b{node}`, { node })).toEqual(["aXb", node]);
  });

  it("merges the strings of an array result into the neighbouring text", () => {
    registerSyntaxExtension(makeMarkExtension({ id: "claims", cacheBit: 4, result: ["X", "Y"] }));

    expect(renderRaw(`a${MARK}b{node}`, { node })).toEqual(["aXYb", node]);
  });
});
