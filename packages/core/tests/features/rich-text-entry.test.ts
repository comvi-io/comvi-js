/**
 * The `@comvi/core/rich-text` seam — the PURE half of the tag toolbox.
 *
 * IMPORTANT: the only entries this file imports statically are the base root
 * and `../../src/rich-text`. That absence IS half the contract: nothing here
 * may register tag syntax behind the assertions' back, so `@comvi/core/tags`
 * is reached exactly once, dynamically, in the last test — which is also what
 * makes the before/after switch observable in a single module registry.
 *
 * Why the seam exists: framework `<T>` components need `prepareTranslation`
 * and the VirtualNode toolbox, and before the split the only entry that
 * published them also ran `registerTagSyntax()` on import. Every app that
 * rendered `<T>` therefore had `<tag>` markup silently activated for plain
 * string-API `t()` as well.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";
import {
  prepareTranslation,
  childrenToArray,
  getPendingHandlerName,
  createElement,
  createFragment,
  createTextNode,
  isVirtualNode,
} from "../../src/rich-text";
import { clearTemplateCache } from "../../src/core/translate";
import { getAmbientExtensions } from "../../src/core/translate/syntax";

const TEMPLATE = "Click <link>here</link> now";

const linkHandler = ({ children }: { children: unknown }) => `[${children}]`;

const host = () =>
  createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: { msg: TEMPLATE } },
  });

describe("@comvi/core/rich-text (pure seam)", () => {
  it("registers no ambient syntax extension when imported", () => {
    expect(getAmbientExtensions()).toHaveLength(0);
  });

  it("leaves string-API tag markup literal — importing it is not an opt-in", () => {
    // Same call the ambient entry turns into "Click [here] now" (see the last
    // test): the handler is supplied, so only the missing grammar can keep the
    // markup literal.
    expect(host().t("msg" as never, { link: linkHandler } as never)).toBe(TEMPLATE);
  });

  it("prepareTranslation still parses tags — the extension travels per call", () => {
    const prepared = prepareTranslation(host(), {
      i18nKey: "msg",
      components: { link: "b" },
    });

    expect(prepared.isMissing).toBe(false);
    const parts = childrenToArray(prepared.content);
    expect(parts[0]).toBe("Click ");
    expect(parts[2]).toBe(" now");

    const element = parts[1];
    expect(isVirtualNode(element)).toBe(true);
    expect(element).toMatchObject({ type: "element", tag: "b", children: ["here"] });

    // ...and it left nothing behind for the string API.
    expect(getAmbientExtensions()).toHaveLength(0);
    expect(host().t("msg" as never, { link: linkHandler } as never)).toBe(TEMPLATE);
  });

  it("routes opaque framework handlers through the marker transport", () => {
    const handler = { $$typeof: Symbol.for("test.element") };
    const prepared = prepareTranslation(host(), {
      i18nKey: "msg",
      components: { link: handler },
    });

    expect(prepared.pendingHandlers).toHaveLength(1);
    const [pending] = prepared.pendingHandlers;
    expect(pending.name).toBe("link");
    expect(pending.handler).toBe(handler);
    expect(getPendingHandlerName(pending.marker)).toBe("link");
    expect(getPendingHandlerName("b")).toBeUndefined();
  });

  it("publishes the VirtualNode toolbox framework converters need", () => {
    expect(createElement("b", { id: "x" }, ["hi"])).toEqual({
      type: "element",
      tag: "b",
      props: { id: "x" },
      children: ["hi"],
    });
    expect(createTextNode("hi")).toEqual({ type: "text", text: "hi" });
    expect(createFragment(["hi"])).toEqual({ type: "fragment", children: ["hi"], key: undefined });
    expect(isVirtualNode({ type: "nope" })).toBe(false);
  });

  it("@comvi/core/tags re-exports the identical bindings and adds the ambient switch", async () => {
    // Runs LAST, and dynamic on purpose — the ONE exception to static imports
    // in this file. A static import is hoisted above every test, so ambient
    // registration would already be in place when the assertions above run and
    // the before/after switch this test exists to observe would vanish.
    const tags = await import("../../src/tags");

    // Same bindings, not copies — the ambient entry is a superset, so consumers
    // that keep importing it observe no change at all.
    expect(tags.prepareTranslation).toBe(prepareTranslation);
    expect(tags.childrenToArray).toBe(childrenToArray);
    expect(tags.getPendingHandlerName).toBe(getPendingHandlerName);
    expect(tags.createElement).toBe(createElement);
    expect(tags.createTextNode).toBe(createTextNode);
    expect(tags.createFragment).toBe(createFragment);
    expect(tags.isVirtualNode).toBe(isVirtualNode);

    // ...plus the registration half, which the pure seam does not carry.
    expect(tags.registerTagSyntax).toBeTypeOf("function");
    expect(getAmbientExtensions()).toHaveLength(1);

    clearTemplateCache();
    expect(host().t("msg" as never, { link: linkHandler } as never)).toBe("Click [here] now");
  });
});
