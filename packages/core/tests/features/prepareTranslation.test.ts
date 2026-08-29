import { describe, it, expect, beforeEach, afterEach } from "vitest";
// NOTE: internals imported directly (not "../../src" or "../../src/tags") so
// ambient tag registration stays under this file's control — nothing here
// registers the tag extension ambiently.
import { I18n } from "../../src/core/i18n";
import { clearTemplateCache } from "../../src/core/translate";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { _resetSyntaxExtensions, getAmbientExtensions } from "../../src/core/translate/syntax";
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
  expect(item).toMatchObject({ type: "element" });
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
    _resetSyntaxExtensions();
    expect(getAmbientExtensions().length).toBe(0);

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

    // Contrast: the plain string API on the same instance has NO tag engine —
    // ambient registry is empty, so the template stays literal.
    expect(i18n.t("msg" as never, { name: "Ada" } as never)).toBe("Hello <bold>Ada</bold>!");
  });

  it("does not leak the per-call extension into later plain calls (cache isolation)", () => {
    const i18n = makeInstance({ msg: "<b>hi</b>" });

    const { content } = prepareTranslation(i18n, {
      i18nKey: "msg",
      components: { b: "strong" },
    });
    expect(elementAt(content, 0).tag).toBe("strong");

    // Same template through the plain pipeline: distinct cache variant, literal output.
    expect(i18n.t("msg" as never)).toBe("<b>hi</b>");
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
          marker: pendingHandlers[0].marker,
          handler: FakeComponent,
          props: { variant: "primary" },
        },
      ]);
      expect(elementAt(content, 0).tag).toBe(pendingHandlers[0].marker);
    });

    it("marker detection rejects non-marker and empty-name tags", () => {
      expect(getPendingHandlerName("strong")).toBeUndefined();
      expect(getPendingHandlerName("__comvi_handler_x__")).toBe("x");
      expect(getPendingHandlerName("__comvi_handler___")).toBeUndefined(); // empty name
      expect(getPendingHandlerName("__comvi_handler_")).toBeUndefined();
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

    it("reserved props override same-named params keys; omitted props leave params intact", () => {
      const i18n = new I18n({ locale: "en", exposeGlobal: false }, icuCompiler);
      i18n.addTranslations({
        en: { msg: "en" },
        fr: { msg: "fr" },
      });

      expect(prepareTranslation(i18n, { i18nKey: "msg", params: { locale: "fr" } }).content).toBe(
        "fr",
      );

      expect(
        prepareTranslation(i18n, {
          i18nKey: "msg",
          params: { locale: "fr" },
          locale: "en",
        }).content,
      ).toBe("en");
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

  it("childrenToArray normalizes strings and arrays", () => {
    expect(childrenToArray("")).toEqual([]);
    expect(childrenToArray("x")).toEqual(["x"]);
    expect(childrenToArray(["a", "b"])).toEqual(["a", "b"]);
  });
});
