/**
 * The three transports `prepareTranslation` multiplexes into ONE `tRaw` call,
 * at the points where a wrapper can tell them apart:
 *
 *  • reserved props (`ns`/`locale`/`fallback`/`raw`) vs. the same-named
 *    `params` keys — a prop only speaks when the wrapper actually passed one;
 *  • `params.tagInterpolation` — a caller's own per-call options must survive
 *    the tag extension being added to them, extensions included;
 *  • `isMissing` — the flag a wrapper reads to decide whether to render its
 *    children-fallback. It must stay false whenever the key really did
 *    resolve, including the cases where the resolved text happens to be the
 *    key itself.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import { createElement } from "../../src/virtualNode";
import type { VirtualNode } from "../../src/virtualNode";
import { prepareTranslation, childrenToArray } from "../../src/core/prepareTranslation";
import { makeMarkExtension } from "../helpers/extensions";
import type { TranslationResult } from "../../src/types";

const makeHost = (translation: Record<string, Record<string, string>>) =>
  createI18n({ locale: "en", translation });

describe("prepareTranslation() reserved props", () => {
  const twoNamespaces = () =>
    makeHost({ en: { msg: "from default" }, "en:admin": { msg: "from admin" } });

  it("leaves a params-supplied ns in place when the prop is omitted", () => {
    const { content } = prepareTranslation(twoNamespaces(), {
      i18nKey: "msg",
      params: { ns: "admin" },
    });

    expect(content).toBe("from admin");
  });

  it("overrides a params-supplied ns with the prop", () => {
    const { content } = prepareTranslation(twoNamespaces(), {
      i18nKey: "msg",
      params: { ns: "admin" },
      ns: "default",
    });

    expect(content).toBe("from default");
  });

  const twoLocales = () =>
    createI18n({ locale: "en", translation: { en: { msg: "en" }, fr: { msg: "fr" } } });

  it("leaves a params-supplied locale in place when the prop is omitted", () => {
    const { content } = prepareTranslation(twoLocales(), {
      i18nKey: "msg",
      params: { locale: "fr" },
    });

    expect(content).toBe("fr");
  });

  it("overrides a params-supplied locale with the prop", () => {
    const { content } = prepareTranslation(twoLocales(), {
      i18nKey: "msg",
      params: { locale: "fr" },
      locale: "en",
    });

    expect(content).toBe("en");
  });

  it("leaves a params-supplied fallback in place when the prop is omitted", () => {
    const { content, isMissing } = prepareTranslation(makeHost({ en: {} }), {
      i18nKey: "nope",
      params: { fallback: "from params" },
    });

    expect(content).toBe("from params");
    expect(isMissing).toBe(false);
  });

  describe("raw", () => {
    // `raw` is not read by the pipeline — it reaches the post-processors,
    // which is where the in-context editor decides to skip a call.
    const withPostProcessor = () =>
      createI18n({
        locale: "en",
        translation: { en: { msg: "text" } },
        postProcess: (result, _key, _ns, params) =>
          params.raw === true ? result : `${result as string}!`,
      });

    it("post-processes when neither the prop nor params ask for raw", () => {
      const { content } = prepareTranslation(withPostProcessor(), { i18nKey: "msg" });

      expect(content).toBe("text!");
    });

    it("leaves a params-supplied raw flag in place when the prop is omitted", () => {
      const { content } = prepareTranslation(withPostProcessor(), {
        i18nKey: "msg",
        params: { raw: true },
      });

      expect(content).toBe("text");
    });

    it("overrides a params-supplied raw flag with the prop", () => {
      const { content } = prepareTranslation(withPostProcessor(), {
        i18nKey: "msg",
        params: { raw: false },
        raw: true,
      });

      expect(content).toBe("text");
    });
  });
});

describe("prepareTranslation() with caller-supplied tagInterpolation", () => {
  it("keeps the caller's other options while activating tag syntax", () => {
    const i18n = makeHost({ en: { msg: "<em>y</em>" } });

    const { content } = prepareTranslation(i18n, {
      i18nKey: "msg",
      params: { tagInterpolation: { basicHtmlTags: ["em"] } },
    });

    expect(content).toEqual([{ type: "element", tag: "em", props: {}, children: ["y"] }]);
  });

  it("unions the caller's own syntax extension with the tag extension", () => {
    const markExtension = makeMarkExtension({ id: "test:mark", cacheBit: 32, result: "★" });
    const i18n = makeHost({ en: { msg: "<mark><b>x</b>" } });

    const { content } = prepareTranslation(i18n, {
      i18nKey: "msg",
      params: { tagInterpolation: { extensions: [markExtension] } },
      components: { b: "strong" },
    });

    expect(content).toEqual(["★", { type: "element", tag: "strong", props: {}, children: ["x"] }]);
  });
});

describe("prepareTranslation() isMissing", () => {
  it("is not missing when a fallback-locale value happens to equal the key", () => {
    const i18n = createI18n({
      locale: "de",
      fallbackLocale: "en",
      translation: { en: { ok: "ok" } },
    });

    const { content, isMissing } = prepareTranslation(i18n, { i18nKey: "ok" });

    expect(content).toBe("ok");
    expect(isMissing).toBe(false);
  });

  it("is not missing when the fallback prop happens to equal the key", () => {
    const { content, isMissing } = prepareTranslation(makeHost({ en: {} }), {
      i18nKey: "nope",
      fallback: "nope",
    });

    expect(content).toBe("nope");
    expect(isMissing).toBe(false);
  });

  it("is not missing when onMissingKey supplies the text", () => {
    const i18n = createI18n({ locale: "en", translation: { en: {} }, onMissingKey: () => "—" });

    const { content, isMissing } = prepareTranslation(i18n, { i18nKey: "nope" });

    expect(content).toBe("—");
    expect(isMissing).toBe(false);
  });
});

describe("prepareTranslation() handler transport", () => {
  it("skips a components entry whose handler is absent", () => {
    const i18n = makeHost({ en: { msg: "<b>x</b>" } });

    const { content, pendingHandlers } = prepareTranslation(i18n, {
      i18nKey: "msg",
      components: { b: undefined },
    });

    expect(pendingHandlers).toEqual([]);
    expect(content).toBe("x");
  });

  it("transports a component function carrying a `tag` property opaquely", () => {
    // Only the OBJECT config form is unwrapped; a framework component that
    // happens to expose `tag` is still the wrapper's to resolve.
    const Component = Object.assign(() => null, { tag: "span" });
    const i18n = makeHost({ en: { msg: "<c>x</c>" } });

    const { pendingHandlers } = prepareTranslation(i18n, {
      i18nKey: "msg",
      components: { c: Component },
    });

    expect(pendingHandlers).toEqual([
      { name: "c", marker: "__comvi_handler_c__", handler: Component },
    ]);
  });
});

describe("childrenToArray()", () => {
  it("drops a bare VirtualNode — the pipeline only ever hands it a string or an array", () => {
    const node: VirtualNode = createElement("b", {}, ["bold"]);

    // A bare node is not a `TranslationResult` — passing one is the misuse
    // this case pins the defensive branch against.
    expect(childrenToArray(node as unknown as TranslationResult)).toEqual([]);
  });
});
