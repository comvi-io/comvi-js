import { afterEach, describe, expect, it } from "vitest";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";
import { createShadowDomContainer, removeShadowDomContainer } from "../src/utils/shadowDom";

describe("shadowDom utilities", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("creates an isolated shadow container with styles and mount point", () => {
    const { container, shadowRoot, mountPoint } = createShadowDomContainer();

    expect(document.body.contains(container)).toBe(true);
    expect(container.getAttribute(EDITOR_UI_SHADOW_HOST_ATTRIBUTE)).toBe("true");
    expect(container.shadowRoot).toBe(shadowRoot);
    expect(shadowRoot.querySelector("style")).not.toBeNull();
    expect(shadowRoot.contains(mountPoint)).toBe(true);
  });

  it("removes created container safely", () => {
    const { container } = createShadowDomContainer();

    removeShadowDomContainer(container);

    expect(document.body.contains(container)).toBe(false);
  });

  it("ignores null containers on removal", () => {
    expect(() => removeShadowDomContainer(null)).not.toThrow();
  });
});
