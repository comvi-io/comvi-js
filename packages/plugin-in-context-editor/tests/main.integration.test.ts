/**
 * The manual `init()` / `stop()` pair against the real `Core`: what a
 * translator can still do on the page after each call, however many times
 * `init()` ran before it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { init, stop } from "../src/main";
import { loadKeyMappings } from "../src/translation";
import { TAG_ATTRIBUTES } from "../src/constants";
import { cleanupDOM } from "./helpers";
import { hoverLabel, renderMarked } from "./helpers/editorPage";

function renderTarget(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

afterEach(() => {
  stop();
  cleanupDOM();
  loadKeyMappings({});
});

describe("manual init()", () => {
  it("init() once → the page's marked text is highlighted", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });

    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });

    expect(await hoverLabel(heading)).toBe("home.title (default)");
  });

  it("init({ targetElement }) → marked text outside the target is not highlighted", async () => {
    const container = renderTarget();
    const outside = renderMarked("footer.copyright", { text: "©" });

    init({ targetElement: container });

    expect(await hoverLabel(outside)).toBeNull();
  });

  it("init() on a second target → the first target's text is no longer highlighted", async () => {
    const first = renderTarget();
    const second = renderTarget();
    const firstHeading = renderMarked("home.title", { text: "Welcome", parent: first });
    init({ targetElement: first });

    init({ targetElement: second });

    expect(await hoverLabel(firstHeading)).toBeNull();
  });

  it("init() on a second target → the second target's text is highlighted", async () => {
    const first = renderTarget();
    const second = renderTarget();
    const secondHeading = renderMarked("checkout.total", { text: "Total", parent: second });
    init({ targetElement: first });

    init({ targetElement: second });

    expect(await hoverLabel(secondHeading)).toBe("checkout.total (default)");
  });
});

describe("manual stop()", () => {
  it("init() then stop() → the page's marked text is no longer highlighted", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });
    init({ targetElement: container });

    stop();

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("init() twice then stop() → no runtime still highlights the page", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });
    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });

    stop();

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("stop() before any init() → does not throw", () => {
    expect(() => stop()).not.toThrow();
  });

  it("stop() before any init() → a later init() still highlights the page", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });
    stop();

    init({ targetElement: container });

    expect(await hoverLabel(heading)).toBe("home.title (default)");
  });

  it("stop() twice after one init() → the second stop() does not throw", () => {
    init({ targetElement: renderTarget() });
    stop();

    expect(() => stop()).not.toThrow();
  });
});
