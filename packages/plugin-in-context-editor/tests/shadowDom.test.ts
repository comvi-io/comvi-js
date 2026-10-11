import { afterEach, describe, expect, it } from "vitest";
import { EDITOR_UI_SHADOW_HOST_ATTRIBUTE } from "../src/constants";
import { createShadowDomContainer, removeShadowDomContainer } from "../src/utils/shadowDom";

describe("createShadowDomContainer()", () => {
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
