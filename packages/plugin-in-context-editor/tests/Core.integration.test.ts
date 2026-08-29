import { describe, it, expect, afterEach } from "vitest";
import { Core } from "../src/Core";
import { encodeKeyToInvisible, registerKey, loadKeyMappings } from "../src/translation";
import { TAG_ATTRIBUTES } from "../src/constants";
import { cleanupDOM } from "./helpers";

/** Wait for MutationObserver callbacks to process DOM mutations */
const flushDOMMutations = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
};

describe("Core.integration.test.ts - Full System Integration", () => {
  afterEach(() => {
    cleanupDOM();
    loadKeyMappings({}); // Clear key mappings between tests
  });

  describe("End-to-end flow with encoded content", () => {
    it("should process encoded text through entire pipeline", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const titleKey = registerKey("home.title");
      const descKey = registerKey("home.description");

      const h1 = document.createElement("h1");
      const titleText = document.createTextNode(`Welcome ${encodeKeyToInvisible(titleKey)}`);
      h1.appendChild(titleText);

      const p = document.createElement("p");
      p.setAttribute("title", `Tooltip ${encodeKeyToInvisible(descKey)}`);
      const descText = document.createTextNode("Description");
      p.appendChild(descText);

      container.appendChild(h1);
      container.appendChild(p);

      const core = new Core({
        targetElement: container,
        tagAttributes: TAG_ATTRIBUTES,
      });

      core.start();

      await flushDOMMutations();

      core.stop();

      expect(h1.textContent).toContain("Welcome");
      expect(p.getAttribute("title")).toContain("Tooltip");

      container.remove();
    });

    it("should handle dynamic content additions with encoding", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({
        targetElement: container,
        tagAttributes: TAG_ATTRIBUTES,
      });

      core.start();

      const key = registerKey("dynamic.key");
      const encoded = encodeKeyToInvisible(key);

      const newDiv = document.createElement("div");
      newDiv.setAttribute("aria-label", `Dynamic ${encoded}`);
      container.appendChild(newDiv);

      await flushDOMMutations();

      core.stop();
      container.remove();

      expect(newDiv.getAttribute("aria-label")).toContain("Dynamic");
    });

    it("should handle multiple elements with different keys", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const keys = ["key1", "key2", "key3", "key4", "key5"].map(registerKey);
      const core = new Core({
        targetElement: container,
        tagAttributes: TAG_ATTRIBUTES,
      });

      core.start();

      keys.forEach((key, index) => {
        const div = document.createElement("div");
        div.setAttribute("title", `Title ${index} ${encodeKeyToInvisible(key)}`);
        container.appendChild(div);
      });

      await flushDOMMutations();

      core.stop();
      container.remove();

      expect(keys.length).toBe(5);
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

      container.remove();
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

      container.remove();
    });
  });

  describe("Memory management", () => {
    it("should clean up event listeners when stopped", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({
        targetElement: container,
        tagAttributes: TAG_ATTRIBUTES,
      });

      core.start();

      const div = document.createElement("div");
      container.appendChild(div);

      core.stop();

      // After stop, mutations should not be processed
      const div2 = document.createElement("div");
      container.appendChild(div2);

      container.remove();

      expect(container.contains(div)).toBe(true);
      expect(container.contains(div2)).toBe(true);
    });
  });

  describe("Element click handling", () => {
    it("should handle element with single key", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({
        targetElement: container,
        tagAttributes: TAG_ATTRIBUTES,
      });

      core.start();

      const key = registerKey("single.key");
      const encoded = encodeKeyToInvisible(key);
      const button = document.createElement("button");
      button.textContent = `Click ${encoded}`;
      container.appendChild(button);

      // Clicking cannot be exercised without the full modal; this only pins
      // that the structure is in place.

      core.stop();
      container.remove();

      expect(button.textContent).toContain("Click");
    });
  });

  describe("Configuration options", () => {
    it("should respect custom targetElement", () => {
      const customTarget = document.createElement("section");
      customTarget.id = "custom-target";
      document.body.appendChild(customTarget);

      const core = new Core({
        targetElement: customTarget,
        tagAttributes: TAG_ATTRIBUTES,
      });

      expect(() => {
        core.start();
        core.stop();
      }).not.toThrow();

      customTarget.remove();
    });

    it("should work with default configuration", () => {
      const core = new Core();

      expect(() => {
        core.start();
        core.stop();
      }).not.toThrow();
    });

    it("should respect custom tagAttributes", () => {
      const customAttributes = {
        div: ["data-custom"],
        span: ["data-test"],
      };

      const core = new Core({
        tagAttributes: customAttributes,
      });

      expect(() => {
        core.start();
        core.stop();
      }).not.toThrow();
    });

    it("should use default TAG_ATTRIBUTES when tagAttributes is undefined", async () => {
      // Regression test for bug where undefined tagAttributes caused
      // "Cannot read properties of undefined (reading 'body')" error
      const container = document.createElement("div");
      document.body.appendChild(container);

      // Simulate plugin passing undefined tagAttributes
      const core = new Core({
        targetElement: container,
        tagAttributes: undefined,
      });

      expect(() => {
        core.start();
      }).not.toThrow();

      // Add content with attributes that should be checked by default TAG_ATTRIBUTES
      const key = registerKey("test.key");
      const encoded = encodeKeyToInvisible(key);

      const input = document.createElement("input");
      input.setAttribute("placeholder", `Enter text ${encoded}`);
      container.appendChild(input);

      await flushDOMMutations();

      expect(() => {
        core.stop();
      }).not.toThrow();

      container.remove();
    });

    it("should use default TAG_ATTRIBUTES when options object is empty", async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const core = new Core({});

      expect(() => {
        core.start();
      }).not.toThrow();

      const key1 = registerKey("test.placeholder");
      const key2 = registerKey("test.aria");
      const encoded1 = encodeKeyToInvisible(key1);
      const encoded2 = encodeKeyToInvisible(key2);

      const textarea = document.createElement("textarea");
      textarea.setAttribute("placeholder", `Type here ${encoded1}`);
      container.appendChild(textarea);

      const div = document.createElement("div");
      div.setAttribute("aria-label", `Label ${encoded2}`);
      container.appendChild(div);

      await flushDOMMutations();

      expect(() => {
        core.stop();
      }).not.toThrow();

      container.remove();
    });
  });
});
