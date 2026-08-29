import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createI18n } from "../../src";
import { createI18n as createFullI18n } from "../../src/core/full";
import { clearTemplateCache } from "../../src/core/translate";
import { TK_PLURAL, type ParsedToken } from "../../src/core/translate/cache";
import {
  _resetSyntaxExtensions,
  registerSyntaxExtension,
  type MessageCompiler,
  type SyntaxExtension,
} from "../../src/core/translate/syntax";
import { createElement } from "../../src/virtualNode";
import type { VirtualNode } from "../../src";

// The part list IS the public shape of `tRaw()`, so a stray empty string is a contract break.

/** A token kind no core path claims — only the extension below produces it. */
const TK_MARK = 90 as unknown as ParsedToken[0];
const MARK = "<mark>";

function markExtension(
  id: string,
  cacheBit: number,
  result: string | VirtualNode | Array<string | VirtualNode> | undefined,
): SyntaxExtension {
  return {
    id,
    cacheBit,
    parseHook(template, index) {
      return template.startsWith(MARK, index)
        ? { token: [TK_MARK, id] as ParsedToken, endIndex: index + MARK.length }
        : undefined;
    },
    processHook(token) {
      return token[0] === TK_MARK ? result : undefined;
    },
  };
}

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
    registerSyntaxExtension(markExtension("declines", 4, undefined));

    expect(renderRaw(`a${MARK}b`)).toBe("ab");
  });

  it("passes a declined token to the next registered extension", () => {
    registerSyntaxExtension(markExtension("declines", 4, undefined));
    registerSyntaxExtension(markExtension("claims", 8, "X"));

    expect(renderRaw(`a${MARK}b`)).toBe("aXb");
  });

  it("merges a string result into the neighbouring text rather than pushing a part", () => {
    registerSyntaxExtension(markExtension("claims", 4, "X"));

    expect(renderRaw(`a${MARK}b{node}`, { node })).toEqual(["aXb", node]);
  });

  it("merges the strings of an array result into the neighbouring text", () => {
    registerSyntaxExtension(markExtension("claims", 4, ["X", "Y"]));

    expect(renderRaw(`a${MARK}b{node}`, { node })).toEqual(["aXYb", node]);
  });
});
