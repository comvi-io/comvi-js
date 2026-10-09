/**
 * The manual `init()` / `stop()` pair against the real `Core`: what a
 * translator can still do on the page after `stop()`, however many times
 * `init()` ran before it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { init, stop } from "../src/main";
import { encodeKeyToInvisible, registerKey, loadKeyMappings } from "../src/translation";
import { TAG_ATTRIBUTES } from "../src/constants";
import { cleanupDOM, flushDOMMutations, getActiveTooltip, simulateMouseEvent } from "./helpers";

/** The Alt+hover tooltip a translator sees on the element, or null. */
function hoverLabel(element: Element): string | null {
  simulateMouseEvent(element, "mouseover", { altKey: true });
  const label = getActiveTooltip()?.textContent ?? null;
  simulateMouseEvent(element, "mouseout", { altKey: true });
  return label;
}

function renderMarkedHeading(): { container: HTMLElement; heading: HTMLElement } {
  const container = document.createElement("div");
  const heading = document.createElement("h1");
  heading.textContent = `Welcome ${encodeKeyToInvisible(registerKey("home.title"))}`;
  container.append(heading);
  document.body.append(container);
  return { container, heading };
}

afterEach(() => {
  stop();
  cleanupDOM();
  loadKeyMappings({});
});

describe("manual init()/stop() against the real runtime", () => {
  it("init() twice then stop() → no runtime still highlights the page", async () => {
    const { container, heading } = renderMarkedHeading();
    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
    await flushDOMMutations();

    stop();

    expect(hoverLabel(heading)).toBeNull();
  });

  it("init() once → the page's marked text is highlighted", async () => {
    const { container, heading } = renderMarkedHeading();

    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
    await flushDOMMutations();

    expect(hoverLabel(heading)).toBe("home.title (default)");
  });
});
