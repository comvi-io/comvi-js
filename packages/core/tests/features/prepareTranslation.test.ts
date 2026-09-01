import { describe, it, expect, beforeEach, afterEach } from "vitest";
// NOTE: internals imported directly (not "../../src" or "../../src/tags") so
// ambient tag registration stays under this file's control — nothing here
// registers the tag extension ambiently.
import { I18n } from "../../src/core/i18n";
import { clearTemplateCache } from "../../src/core/translate";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { _resetSyntaxExtensions } from "../../src/core/translate/syntax";
import {
  prepareTranslation,
  getPendingHandlerName,
  childrenToArray,
} from "../../src/core/prepareTranslation";
import type { ElementNode, VirtualNode } from "../../src/virtualNode";

function makeInstance(translations: Record<string, string>) {
  const i18n = new I18n({ locale: "en", exposeGlobal: false }, icuCompiler);
  i18n.addTranslations({ en: translations });
  return i18n;
}

function elementAt(content: unknown, index: number): ElementNode {
  const item = (content as Array<string | VirtualNode>)[index];
  expect(item, `content[${index}]`).toMatchObject({ type: "element" });
  return item as ElementNode;
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

afterEach(() => {
  _resetSyntaxExtensions();
});

describe("prepareTranslation", () => {
  it("renders correctly with ambient registry explicitly reset (per-call channel is self-sufficient)", () => {
    const i18n = makeInstance({ msg: "Hello <bold>{name}</bold>!" });
    const { content, pendingHandlers, isMissing } = prepareTranslation(i18n, {
      i18nKey: "msg",
      params: { name: "Ada" },
      components: { bold: "strong" },
    });

    expect(isMissing).toBe(false);
    expect(pendingHandlers).toEqual([]);
    expect(content).toEqual([
      "Hello ",
      { type: "element", tag: "strong", props: {}, children: ["Ada"] },
      "!",
    ]);
  });

  it("does not leak the per-call extension into later plain calls (cache isolation)", () => {
    const i18n = makeInstance({ msg: "<b>hi</b>" });

    const { content } = prepareTranslation(i18n, {
      i18nKey: "msg",
      components: { b: "strong" },
    });
    expect(elementAt(content, 0).tag).toBe("strong");

    // Same template through the plain pipeline: distinct cache variant, literal output.
    const plain = i18n.t("msg" as never);

    expect(plain).toBe("<b>hi</b>");
  });

  describe("handler transport", () => {
    it("transports opaque framework handlers via marker nodes and pendingHandlers", () => {
      const i18n = makeInstance({ msg: "Click <link>here</link>" });
      const frameworkHandler = () => "framework-node";

      const { content, pendingHandlers } = prepareTranslation(i18n, {
        i18nKey: "msg",
        components: { link: frameworkHandler },
      });

      expect(pendingHandlers).toHaveLength(1);
      const pending = pendingHandlers[0];
      expect(pending.name).toBe("link");
      expect(pending.handler).toBe(frameworkHandler);
      expect(pending.props).toBeUndefined();

      const node = elementAt(content, 1);
      expect(node.tag).toBe(pending.marker);
      expect(node.children).toEqual(["here"]);
      expect(getPendingHandlerName(node.tag)).toBe("link");
    });

    it("renders string mappings and string-target configs directly (no pending handler)", () => {
      const i18n = makeInstance({ msg: "<plain>a</plain><cfg>b</cfg>" });

      const { content, pendingHandlers } = prepareTranslation(i18n, {
        i18nKey: "msg",
        components: {
          plain: "em",
          cfg: { tag: "a", props: { href: "/help", hidden: true } },
        },
      });

      expect(pendingHandlers).toEqual([]);
      expect(content).toEqual([
        { type: "element", tag: "em", props: {}, children: ["a"] },
        { type: "element", tag: "a", props: { href: "/help", hidden: true }, children: ["b"] },
      ]);
    });

    it("transports config-form component targets with their props (vue `component` alias)", () => {
      const i18n = makeInstance({ msg: "<btn>Save</btn>" });
      const FakeComponent = { render: () => null };

      const { content, pendingHandlers } = prepareTranslation(i18n, {
        i18nKey: "msg",
        components: { btn: { component: FakeComponent, props: { variant: "primary" } } },
      });

      expect(pendingHandlers).toEqual([
        {
          name: "btn",
          marker: "__comvi_handler_btn__",
          handler: FakeComponent,
          props: { variant: "primary" },
        },
      ]);
      expect(elementAt(content, 0).tag).toBe("__comvi_handler_btn__");
    });

    it.each([
      ["strong", undefined],
      ["__comvi_handler_x__", "x"],
      ["__comvi_handler___", undefined],
      ["__comvi_handler_", undefined],
      ["__comvi_handler_widget", undefined],
    ])("getPendingHandlerName(%j) → %j", (tag, expected) => {
      expect(getPendingHandlerName(tag)).toBe(expected);
    });
  });

  describe("params", () => {
    it("interpolates params inside and outside tags", () => {
      const i18n = makeInstance({ msg: "{greeting} <b>{name}</b>" });

      const { content } = prepareTranslation(i18n, {
        i18nKey: "msg",
        params: { greeting: "Hi", name: "Ada" },
        components: { b: "strong" },
      });

      expect(content).toEqual([
        "Hi ",
        { type: "element", tag: "strong", props: {}, children: ["Ada"] },
      ]);
    });
  });

  describe("missing-key fallback", () => {
    it("flags a missing key with no fallback (content echoes the key)", () => {
      const i18n = makeInstance({});
      const { content, isMissing } = prepareTranslation(i18n, { i18nKey: "nope" });
      expect(content).toBe("nope");
      expect(isMissing).toBe(true);
    });

    it("renders the fallback prop through the tag pipeline and is not missing", () => {
      const i18n = makeInstance({});
      const { content, isMissing } = prepareTranslation(i18n, {
        i18nKey: "nope",
        fallback: "See <b>docs</b>",
        components: { b: "strong" },
      });

      expect(isMissing).toBe(false);
      expect(content).toEqual([
        "See ",
        { type: "element", tag: "strong", props: {}, children: ["docs"] },
      ]);
    });

    it("is not missing when the key resolves", () => {
      const i18n = makeInstance({ msg: "value" });
      const { content, isMissing } = prepareTranslation(i18n, { i18nKey: "msg" });
      expect(content).toBe("value");
      expect(isMissing).toBe(false);
    });

    it("is not missing when a fallback-locale resolves the key", () => {
      const i18n = new I18n(
        { locale: "de", fallbackLocale: "en", exposeGlobal: false },
        icuCompiler,
      );
      i18n.addTranslations({ en: { msg: "english" } });
      const { content, isMissing } = prepareTranslation(i18n, { i18nKey: "msg" });
      expect(content).toBe("english");
      expect(isMissing).toBe(false);
    });
  });

  describe("nested tags", () => {
    it("renders nested tag structures with mixed handler kinds", () => {
      const i18n = makeInstance({ msg: "a <outer>x <inner>y</inner></outer> b" });
      const frameworkHandler = () => null;

      const { content, pendingHandlers } = prepareTranslation(i18n, {
        i18nKey: "msg",
        components: { outer: "span", inner: frameworkHandler },
      });

      expect(pendingHandlers).toHaveLength(1);
      const outer = elementAt(content, 1);
      expect(outer.tag).toBe("span");
      expect(outer.children[0]).toBe("x ");
      const inner = outer.children[1] as ElementNode;
      expect(inner.type).toBe("element");
      expect(inner.tag).toBe(pendingHandlers[0].marker);
      expect(inner.children).toEqual(["y"]);
    });
  });

  it.each<[string | string[], string[]]>([
    ["", []],
    ["x", ["x"]],
    [
      ["a", "b"],
      ["a", "b"],
    ],
  ])("childrenToArray(%j) → %j", (input, expected) => {
    expect(childrenToArray(input)).toEqual(expected);
  });
});
