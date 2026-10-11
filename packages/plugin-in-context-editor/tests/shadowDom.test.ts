import { afterEach, describe, expect, it, vi } from "vitest";
import editorCss from "../src/assets/index.css?inline";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";
import { createShadowDomContainer, removeShadowDomContainer } from "../src/utils/shadowDom";

/**
 * The module keeps the constructed sheet for the page's lifetime, so a suite
 * that takes constructable stylesheets away needs a module that never built one.
 */
async function freshCreateShadowDomContainer(): Promise<typeof createShadowDomContainer> {
  vi.resetModules();
  return (await import("../src/utils/shadowDom")).createShadowDomContainer;
}

describe("createShadowDomContainer()", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates an isolated shadow container with a mount point", () => {
    const { container, shadowRoot, mountPoint } = createShadowDomContainer();

    expect(document.body.contains(container)).toBe(true);
    expect(container.getAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE)).toBe("true");
    expect(container.shadowRoot).toBe(shadowRoot);
    expect(shadowRoot.contains(mountPoint)).toBe(true);
  });

  it("browser with constructable stylesheets → the shadow root adopts the editor stylesheet", () => {
    const { shadowRoot } = createShadowDomContainer();

    expect(shadowRoot.adoptedStyleSheets).toHaveLength(1);
    expect(shadowRoot.adoptedStyleSheets[0]).toBeInstanceOf(CSSStyleSheet);
  });

  it("browser with constructable stylesheets → no <style> element is created, so CSP style-src has nothing to block", () => {
    const { shadowRoot } = createShadowDomContainer();

    expect(shadowRoot.querySelector("style")).toBeNull();
  });

  it("two containers → both shadow roots adopt the same stylesheet object, parsed once", async () => {
    const create = await freshCreateShadowDomContainer();
    const replaceSync = vi.spyOn(CSSStyleSheet.prototype, "replaceSync");

    const first = create();
    const second = create();

    expect(second.shadowRoot.adoptedStyleSheets[0]).toBe(first.shadowRoot.adoptedStyleSheets[0]);
    expect(replaceSync).toHaveBeenCalledExactlyOnceWith(editorCss);
  });

  it("browser without the CSSStyleSheet constructor → falls back to a <style> element with the stylesheet text", async () => {
    const create = await freshCreateShadowDomContainer();
    vi.stubGlobal("CSSStyleSheet", undefined);

    const { shadowRoot } = create();

    expect(shadowRoot.querySelectorAll("style")).toHaveLength(1);
    expect(shadowRoot.querySelector("style")?.textContent).toBe(editorCss);
  });

  it("shadow root that rejects adoptedStyleSheets → falls back to a <style> element placed before the mount point", async () => {
    const create = await freshCreateShadowDomContainer();
    vi.spyOn(ShadowRoot.prototype, "adoptedStyleSheets", "set").mockImplementation(() => {
      throw new TypeError("adoptedStyleSheets is not supported");
    });

    const { shadowRoot, mountPoint } = create();

    expect(shadowRoot.querySelector("style")?.textContent).toBe(editorCss);
    expect(shadowRoot.firstElementChild?.tagName).toBe("STYLE");
    expect(shadowRoot.lastElementChild).toBe(mountPoint);
  });

  it("engine whose shadow roots have no adoptedStyleSheets property → falls back to a <style> element", async () => {
    const create = await freshCreateShadowDomContainer();
    const descriptor = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets");
    expect(descriptor).toBeDefined();
    delete (ShadowRoot.prototype as { adoptedStyleSheets?: unknown }).adoptedStyleSheets;

    try {
      const { shadowRoot } = create();

      expect("adoptedStyleSheets" in shadowRoot).toBe(false);
      expect(shadowRoot.querySelector("style")?.textContent).toBe(editorCss);
    } finally {
      Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", descriptor!);
    }
  });

  it("adoptedStyleSheets setter that ignores the assignment → falls back to a <style> element", async () => {
    const create = await freshCreateShadowDomContainer();
    vi.spyOn(ShadowRoot.prototype, "adoptedStyleSheets", "set").mockImplementation(() => undefined);

    const { shadowRoot } = create();

    expect(shadowRoot.adoptedStyleSheets).toHaveLength(0);
    expect(shadowRoot.querySelector("style")?.textContent).toBe(editorCss);
  });

  it("engine that hands adoptedStyleSheets back as a frozen copy → the sheet is adopted, no <style> fallback", async () => {
    const create = await freshCreateShadowDomContainer();
    let adopted: readonly CSSStyleSheet[] = Object.freeze([]);
    vi.spyOn(ShadowRoot.prototype, "adoptedStyleSheets", "set").mockImplementation((sheets) => {
      adopted = Object.freeze([...sheets]);
    });
    vi.spyOn(ShadowRoot.prototype, "adoptedStyleSheets", "get").mockImplementation(
      () => adopted as CSSStyleSheet[],
    );

    const { shadowRoot } = create();

    expect(adopted).toHaveLength(1);
    expect(adopted[0]).toBeInstanceOf(CSSStyleSheet);
    expect(shadowRoot.querySelector("style")).toBeNull();
  });

  it("gives each call its own host, root and mount point", () => {
    const first = createShadowDomContainer();
    const second = createShadowDomContainer();

    expect(second.container).not.toBe(first.container);
    expect(second.shadowRoot).not.toBe(first.shadowRoot);
    expect(second.mountPoint).not.toBe(first.mountPoint);
    expect(document.body.querySelectorAll(`[${EDITOR_UI_SHADOW_HOST_ATTRIBUTE}]`)).toHaveLength(2);
  });
});

describe("removeShadowDomContainer()", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("detaches the created container from the document", () => {
    const { container } = createShadowDomContainer();

    removeShadowDomContainer(container);

    expect(document.body.contains(container)).toBe(false);
  });

  it("ignores a container that is already detached", () => {
    const { container } = createShadowDomContainer();
    removeShadowDomContainer(container);

    expect(() => removeShadowDomContainer(container)).not.toThrow();
    expect(document.body.contains(container)).toBe(false);
  });

  it("ignores null containers on removal", () => {
    expect(() => removeShadowDomContainer(null)).not.toThrow();
  });
});
