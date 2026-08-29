import { describe, it, expect, afterEach } from "vitest";
import { Core } from "../src/Core";
import { encodeKeyToInvisible, registerKey, loadKeyMappings } from "../src/translation";
import { TAG_ATTRIBUTES } from "../src/constants";
import { cleanupDOM, flushDOMMutations, getActiveTooltip, simulateMouseEvent } from "./helpers";

/**
 * `Core` exposes no accessor for its registry, so every assertion here reads
 * the one public output of the scan pipeline: the Alt+hover tooltip, whose text
 * is the key the scanner decoded onto the element.
 */
function hoverLabel(element: Element): string | null {
  simulateMouseEvent(element, "mouseover", { altKey: true });
  const label = getActiveTooltip()?.textContent ?? null;
  simulateMouseEvent(element, "mouseout", { altKey: true });
  return label;
}

describe("Core end-to-end", () => {
  afterEach(() => {
    cleanupDOM();
    loadKeyMappings({});
  });

  describe("End-to-end flow with encoded content", () => {
    it("should process encoded text through entire pipeline", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const h1 = document.createElement("h1");
      h1.appendChild(
        document.createTextNode(`Welcome ${encodeKeyToInvisible(registerKey("home.title"))}`),
      );
      const p = document.createElement("p");
      p.setAttribute("title", `Tooltip ${encodeKeyToInvisible(registerKey("home.description"))}`);

      container.append(h1, p);

      const core = new Core({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      core.start();
      await flushDOMMutations();

      expect(hoverLabel(h1)).toBe("home.title (default)");
      expect(hoverLabel(p)).toBe("home.description (default)");

      core.stop();
    });

    it("should handle dynamic content additions with encoding", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      core.start();

      const newDiv = document.createElement("div");
      newDiv.setAttribute(
        "aria-label",
        `Dynamic ${encodeKeyToInvisible(registerKey("dynamic.key"))}`,
      );
      container.appendChild(newDiv);
      await flushDOMMutations();

      expect(hoverLabel(newDiv)).toBe("dynamic.key (default)");

      core.stop();
    });

    it("should handle multiple elements with different keys", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      core.start();

      const divs = ["key1", "key2", "key3"].map((key) => {
        const div = document.createElement("div");
        div.setAttribute("title", `Title ${encodeKeyToInvisible(registerKey(key))}`);
        container.appendChild(div);
        return div;
      });
      await flushDOMMutations();

      expect(divs.map(hoverLabel)).toEqual(["key1 (default)", "key2 (default)", "key3 (default)"]);

      core.stop();
    });
  });

  describe("System lifecycle", () => {
    it("should start and stop without errors", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({
        targetElement: container,
        tagAttributes: TAG_ATTRIBUTES,
      });

      expect(() => {
        core.start();
        core.stop();
      }).not.toThrow();
    });

    it("should handle multiple start/stop cycles", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({
        targetElement: container,
        tagAttributes: TAG_ATTRIBUTES,
      });

      expect(() => {
        for (let i = 0; i < 5; i++) {
          core.start();
          core.stop();
        }
      }).not.toThrow();
    });
  });

  describe("Memory management", () => {
    it("should clean up event listeners when stopped", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      core.start();
      core.stop();

      const div = document.createElement("div");
      div.setAttribute("title", `After stop ${encodeKeyToInvisible(registerKey("after.stop"))}`);
      container.appendChild(div);
      await flushDOMMutations();

      expect(hoverLabel(div)).toBeNull();
    });
  });

  describe("Configuration options", () => {
    it("should respect custom targetElement", async () => {
      const customTarget = document.createElement("section");
      const outside = document.createElement("div");
      document.body.append(customTarget, outside);

      const core = new Core({ targetElement: customTarget, tagAttributes: TAG_ATTRIBUTES });
      core.start();

      const inside = document.createElement("div");
      inside.setAttribute("title", `In ${encodeKeyToInvisible(registerKey("inside.key"))}`);
      customTarget.appendChild(inside);
      outside.setAttribute("title", `Out ${encodeKeyToInvisible(registerKey("outside.key"))}`);
      await flushDOMMutations();

      expect(hoverLabel(inside)).toBe("inside.key (default)");
      expect(hoverLabel(outside)).toBeNull();

      core.stop();
    });

    it("should work with default configuration", () => {
      const core = new Core();

      expect(() => {
        core.start();
        core.stop();
      }).not.toThrow();
    });

    it("should respect custom tagAttributes", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({
        targetElement: container,
        tagAttributes: { div: ["data-custom"] },
      });
      core.start();

      const watched = document.createElement("div");
      watched.setAttribute(
        "data-custom",
        `Custom ${encodeKeyToInvisible(registerKey("custom.key"))}`,
      );
      const unwatched = document.createElement("div");
      unwatched.setAttribute("title", `Title ${encodeKeyToInvisible(registerKey("title.key"))}`);
      container.append(watched, unwatched);
      await flushDOMMutations();

      expect(hoverLabel(watched)).toBe("custom.key (default)");
      expect(hoverLabel(unwatched)).toBeNull();

      core.stop();
    });

    it("should use default TAG_ATTRIBUTES when tagAttributes is undefined", async () => {
      // Regression: undefined tagAttributes used to crash with
      // "Cannot read properties of undefined (reading 'body')".
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({ targetElement: container, tagAttributes: undefined });
      core.start();

      const input = document.createElement("input");
      input.setAttribute(
        "placeholder",
        `Enter text ${encodeKeyToInvisible(registerKey("test.key"))}`,
      );
      container.appendChild(input);
      await flushDOMMutations();

      expect(hoverLabel(input)).toBe("test.key (default)");

      core.stop();
    });

    it("should use default TAG_ATTRIBUTES when options object is empty", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({});
      core.start();

      const textarea = document.createElement("textarea");
      textarea.setAttribute(
        "placeholder",
        `Type here ${encodeKeyToInvisible(registerKey("test.placeholder"))}`,
      );
      const div = document.createElement("div");
      div.setAttribute("aria-label", `Label ${encodeKeyToInvisible(registerKey("test.aria"))}`);
      container.append(textarea, div);
      await flushDOMMutations();

      expect(hoverLabel(textarea)).toBe("test.placeholder (default)");
      expect(hoverLabel(div)).toBe("test.aria (default)");

      core.stop();
    });
  });
});
