import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TranslationScanner } from "../src/TranslationScanner";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { EventBus } from "../src/EventBus";
import { encodeKeyToInvisible, registerKey, resetEncoder } from "../src/translation";
import { TAG_ATTRIBUTES } from "../src/constants";
import { INVALID_DATA } from "./fixtures";
import { cleanupDOM } from "./helpers";

describe("TranslationScanner", () => {
  let eventBus: EventBus;
  let map: TranslationRegistry;
  let scanner: TranslationScanner;

  /** The (key, namespace) pairs the scanner decoded onto `element`, in registration order. */
  function registeredKeys(element: Element): Array<{ key: string; ns: string }> {
    return [...(map.get(element)?.nodes.values() ?? [])].map(({ key, ns }) => ({ key, ns }));
  }

  beforeEach(() => {
    eventBus = new EventBus();
    map = new TranslationRegistry(eventBus);
    scanner = new TranslationScanner(eventBus, map, {
      targetElement: document,
      tagAttributes: TAG_ATTRIBUTES,
    });
  });

  afterEach(() => {
    scanner.destroy();
    cleanupDOM();
    resetEncoder();
  });

  describe("Text node processing", () => {
    it("should process text nodes with encoded keys", () => {
      const key = registerKey("text.key");
      const encoded = encodeKeyToInvisible(key);

      const p = document.createElement("p");
      const textNode = document.createTextNode(`Text ${encoded}`);
      p.appendChild(textNode);

      eventBus.emit("structureChanges", [p]);

      expect(map.get(p)?.nodes.get(textNode)).toEqual({
        key: "text.key",
        ns: "default",
        textPreview: "Text",
      });
    });

    it("should process multiple text nodes in same element", () => {
      const key1 = registerKey("key1");
      const key2 = registerKey("key2");

      const div = document.createElement("div");
      const text1 = document.createTextNode(`First ${encodeKeyToInvisible(key1)}`);
      const text2 = document.createTextNode(`Second ${encodeKeyToInvisible(key2)}`);

      div.appendChild(text1);
      div.appendChild(text2);

      eventBus.emit("structureChanges", [div]);

      expect(registeredKeys(div)).toEqual([
        { key: "key1", ns: "default" },
        { key: "key2", ns: "default" },
      ]);
    });

    it("should handle textChanges events", () => {
      const key = registerKey("change.key");
      const p = document.createElement("p");
      const textNode = document.createTextNode("Initial");
      p.appendChild(textNode);
      document.body.appendChild(p);

      // Change text to include encoding
      textNode.nodeValue = `Changed ${encodeKeyToInvisible(key)}`;

      eventBus.emit("textChanges", [textNode]);

      expect(registeredKeys(p)).toEqual([{ key: "change.key", ns: "default" }]);
    });

    it("should remove stale text registrations when encoded markers disappear", () => {
      const key = registerKey("ghost.key");
      const p = document.createElement("p");
      const textNode = document.createTextNode(`Value ${encodeKeyToInvisible(key)}`);
      p.appendChild(textNode);

      eventBus.emit("structureChanges", [p]);
      expect(registeredKeys(p)).toEqual([{ key: "ghost.key", ns: "default" }]);

      textNode.nodeValue = "Plain value";
      eventBus.emit("textChanges", [textNode]);

      expect(map.has(p)).toBe(false);
    });

    it("should ignore a non-text node reported by textChanges", () => {
      const key = registerKey("comment.key");
      const p = document.createElement("p");
      p.appendChild(document.createComment(`Comment ${encodeKeyToInvisible(key)}`));

      eventBus.emit("textChanges", [p.firstChild!]);

      expect(map.has(p)).toBe(false);
    });

    it("should ignore a detached text node that has no element ancestor", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const key = registerKey("orphan.key");
      const orphan = document.createTextNode(`Orphan ${encodeKeyToInvisible(key)}`);

      eventBus.emit("textChanges", [orphan]);

      expect(map.size()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("should drop only the blanked text node's registration and keep its sibling's", () => {
      const keptKey = registerKey("kept.key");
      const blankedKey = registerKey("blanked.key");
      const p = document.createElement("p");
      const keptNode = document.createTextNode(`Kept ${encodeKeyToInvisible(keptKey)}`);
      const blankedNode = document.createTextNode(`Blanked ${encodeKeyToInvisible(blankedKey)}`);
      p.append(keptNode, blankedNode);
      eventBus.emit("structureChanges", [p]);

      blankedNode.nodeValue = "";
      eventBus.emit("textChanges", [blankedNode]);

      expect(registeredKeys(p)).toEqual([{ key: "kept.key", ns: "default" }]);
    });

    it("should not register text whose encoded id has no key mapping", () => {
      const div = document.createElement("div");
      div.appendChild(document.createTextNode(`Ghost ${encodeKeyToInvisible(4242)}`));

      eventBus.emit("structureChanges", [div]);

      expect(map.has(div)).toBe(false);
    });
  });

  describe("Attribute processing", () => {
    it("should process attributes with encoded keys", () => {
      const key = registerKey("attr.key");
      const encoded = encodeKeyToInvisible(key);

      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${encoded}`);

      eventBus.emit("attributeChanges", [input]);

      expect(registeredKeys(input)).toEqual([{ key: "attr.key", ns: "default" }]);
    });

    it("should process multiple attributes on same element", () => {
      const key1 = registerKey("placeholder.key");
      const key2 = registerKey("title.key");
      const key3 = registerKey("aria.key");

      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${encodeKeyToInvisible(key1)}`);
      input.setAttribute("title", `Title ${encodeKeyToInvisible(key2)}`);
      input.setAttribute("aria-label", `Label ${encodeKeyToInvisible(key3)}`);

      eventBus.emit("attributeChanges", [input]);

      expect(registeredKeys(input)).toEqual([
        { key: "placeholder.key", ns: "default" },
        { key: "title.key", ns: "default" },
        { key: "aria.key", ns: "default" },
      ]);
    });

    it("should handle tag-specific attributes", () => {
      const key = registerKey("textarea.placeholder");
      const encoded = encodeKeyToInvisible(key);

      const textarea = document.createElement("textarea");
      textarea.setAttribute("placeholder", `Enter text ${encoded}`);

      eventBus.emit("attributeChanges", [textarea]);

      expect(registeredKeys(textarea)).toEqual([{ key: "textarea.placeholder", ns: "default" }]);
    });

    it("should handle universal attributes (*)", () => {
      const key = registerKey("universal.title");
      const encoded = encodeKeyToInvisible(key);

      const span = document.createElement("span");
      span.setAttribute("title", `Tooltip ${encoded}`);

      eventBus.emit("attributeChanges", [span]);

      expect(registeredKeys(span)).toEqual([{ key: "universal.title", ns: "default" }]);
    });

    it("should handle selector-based tagAttributes rules", () => {
      const key = registerKey("input.button.value");
      const encoded = encodeKeyToInvisible(key);

      const inputButton = document.createElement("input");
      inputButton.setAttribute("type", "button");
      inputButton.setAttribute("value", `Click ${encoded}`);

      eventBus.emit("attributeChanges", [inputButton]);

      expect(registeredKeys(inputButton)).toEqual([{ key: "input.button.value", ns: "default" }]);
    });

    it("should remove stale attribute registrations when encoded markers disappear", () => {
      const key = registerKey("placeholder.key");
      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${encodeKeyToInvisible(key)}`);

      eventBus.emit("attributeChanges", [input]);
      expect(registeredKeys(input)).toEqual([{ key: "placeholder.key", ns: "default" }]);

      input.setAttribute("placeholder", "Plain placeholder");
      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should remove a stale selector-matched attribute registration once its markers disappear", () => {
      const key = registerKey("submit.value");
      const input = document.createElement("input");
      input.setAttribute("type", "submit");
      input.setAttribute("value", `Send ${encodeKeyToInvisible(key)}`);
      eventBus.emit("attributeChanges", [input]);

      input.setAttribute("value", "Send");
      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should not scan an attribute that only another tag's rule lists", () => {
      const key = registerKey("stray.placeholder");
      const div = document.createElement("div");
      div.setAttribute("placeholder", `Stray ${encodeKeyToInvisible(key)}`);

      eventBus.emit("attributeChanges", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("should not register an attribute whose encoded id has no key mapping", () => {
      const input = document.createElement("input");
      input.setAttribute("placeholder", `Ghost ${encodeKeyToInvisible(4242)}`);

      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should not re-register an unchanged attribute on a repeated scan", () => {
      const key = registerKey("stable.key");
      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${encodeKeyToInvisible(key)}`);
      eventBus.emit("attributeChanges", [input]);
      const removedSpy = vi.fn();
      eventBus.on("translationRemoved", removedSpy);

      eventBus.emit("attributeChanges", [input]);

      expect(removedSpy).not.toHaveBeenCalled();
      expect(registeredKeys(input)).toEqual([{ key: "stable.key", ns: "default" }]);
    });

    it("should skip an element's text registrations, without erroring on them, when only the attributes are re-scanned", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const textKey = registerKey("text.key");
      const attrKey = registerKey("attr.key");
      const div = document.createElement("div");
      div.setAttribute("aria-label", `Label ${encodeKeyToInvisible(attrKey)}`);
      div.appendChild(document.createTextNode(`Body ${encodeKeyToInvisible(textKey)}`));
      eventBus.emit("structureChanges", [div]);

      eventBus.emit("attributeChanges", [div]);

      expect(registeredKeys(div)).toEqual([
        { key: "attr.key", ns: "default" },
        { key: "text.key", ns: "default" },
      ]);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("should remove a stale attribute registration when its value is edited in place", () => {
      // `setAttributeNode` + a `value` write keeps the Attr identity that
      // `setAttribute` replaces, which is the case the encoded-marker check guards.
      const key = registerKey("inplace.key");
      const input = document.createElement("input");
      const placeholder = document.createAttribute("placeholder");
      placeholder.value = `Placeholder ${encodeKeyToInvisible(key)}`;
      input.setAttributeNode(placeholder);
      eventBus.emit("attributeChanges", [input]);

      placeholder.value = "Plain placeholder";
      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should keep a registration for an attribute that leaves the element's checked set", () => {
      const key = registerKey("button.value");
      const input = document.createElement("input");
      input.setAttribute("type", "button");
      input.setAttribute("value", `Click ${encodeKeyToInvisible(key)}`);
      eventBus.emit("attributeChanges", [input]);

      input.setAttribute("type", "text");
      eventBus.emit("attributeChanges", [input]);

      expect(registeredKeys(input)).toEqual([{ key: "button.value", ns: "default" }]);
    });
  });

  describe("Structure changes", () => {
    it("should process nested structures", () => {
      const key1 = registerKey("parent.key");
      const key2 = registerKey("child.key");

      const parent = document.createElement("div");
      parent.setAttribute("title", `Parent ${encodeKeyToInvisible(key1)}`);

      const child = document.createElement("span");
      child.setAttribute("title", `Child ${encodeKeyToInvisible(key2)}`);

      parent.appendChild(child);

      eventBus.emit("structureChanges", [parent]);

      expect(registeredKeys(parent)).toEqual([{ key: "parent.key", ns: "default" }]);
      expect(registeredKeys(child)).toEqual([{ key: "child.key", ns: "default" }]);
    });

    it("should process deeply nested structures", () => {
      const root = document.createElement("div");
      let current = root;

      const levels: HTMLElement[] = [];
      for (let i = 0; i < 5; i++) {
        const child = document.createElement("div");
        child.setAttribute("title", `Level ${i} ${encodeKeyToInvisible(registerKey(`level${i}`))}`);
        current.appendChild(child);
        current = child;
        levels.push(child);
      }

      eventBus.emit("structureChanges", [root]);

      expect(map.size()).toBe(5);
      expect(levels.map(registeredKeys)).toEqual([
        [{ key: "level0", ns: "default" }],
        [{ key: "level1", ns: "default" }],
        [{ key: "level2", ns: "default" }],
        [{ key: "level3", ns: "default" }],
        [{ key: "level4", ns: "default" }],
      ]);
    });

    it("should avoid duplicate processing for overlapping structure roots", () => {
      const key = registerKey("overlap.key");
      const parent = document.createElement("div");
      const child = document.createElement("span");
      const textNode = document.createTextNode(`Value ${encodeKeyToInvisible(key)}`);
      child.appendChild(textNode);
      parent.appendChild(child);

      const updatedSpy = vi.fn();
      eventBus.on("translationUpdated", updatedSpy);

      eventBus.emit("structureChanges", [parent, child]);

      expect(registeredKeys(child)).toEqual([{ key: "overlap.key", ns: "default" }]);
      expect(updatedSpy).not.toHaveBeenCalled();
    });

    it("should process a root listed twice in one batch only once", () => {
      const key = registerKey("dup.key");
      const p = document.createElement("p");
      p.appendChild(document.createTextNode(`Value ${encodeKeyToInvisible(key)}`));
      const updatedSpy = vi.fn();
      eventBus.on("translationUpdated", updatedSpy);

      eventBus.emit("structureChanges", [p, p]);

      expect(registeredKeys(p)).toEqual([{ key: "dup.key", ns: "default" }]);
      expect(updatedSpy).not.toHaveBeenCalled();
    });

    it("should register a text node handed directly to structureChanges", () => {
      const key = registerKey("direct.text");
      const p = document.createElement("p");
      const textNode = document.createTextNode(`Direct ${encodeKeyToInvisible(key)}`);
      p.appendChild(textNode);

      eventBus.emit("structureChanges", [textNode]);

      expect(registeredKeys(p)).toEqual([{ key: "direct.text", ns: "default" }]);
    });

    it("should ignore an option element that has no parent to map onto", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const key = registerKey("orphan.option");
      const option = document.createElement("option");
      option.appendChild(document.createTextNode(`Option ${encodeKeyToInvisible(key)}`));

      eventBus.emit("structureChanges", [option]);

      expect(map.size()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe("Removed nodes", () => {
    it("should cleanup removed nodes", () => {
      const key = registerKey("removed.key");
      const div = document.createElement("div");
      const textNode = document.createTextNode(`Text ${encodeKeyToInvisible(key)}`);
      div.appendChild(textNode);

      eventBus.emit("structureChanges", [div]);
      expect(registeredKeys(div)).toEqual([{ key: "removed.key", ns: "default" }]);

      eventBus.emit("nodesRemoved", [textNode]);

      expect(map.has(div)).toBe(false);
    });

    it("should cleanup removed elements", () => {
      const key = registerKey("element.key");
      const div = document.createElement("div");
      div.setAttribute("title", `Title ${encodeKeyToInvisible(key)}`);

      eventBus.emit("structureChanges", [div]);
      expect(registeredKeys(div)).toEqual([{ key: "element.key", ns: "default" }]);

      eventBus.emit("nodesRemoved", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("should batch cleanup for multiple removed nodes in one registry pass", () => {
      const cleanupSpy = vi.spyOn(map, "cleanupRemovedNodes");
      const textNode1 = document.createTextNode("a");
      const textNode2 = document.createTextNode("b");

      eventBus.emit("nodesRemoved", [textNode1, textNode2]);

      expect(cleanupSpy).toHaveBeenCalledTimes(1);
      const removedSet = cleanupSpy.mock.calls[0]?.[0];
      expect(removedSet).toBeInstanceOf(Set);
      expect(removedSet?.has(textNode1)).toBe(true);
      expect(removedSet?.has(textNode2)).toBe(true);
    });
  });

  describe("IGNORED_NODES handling", () => {
    it("should ignore script tags", () => {
      const key = registerKey("script.key");
      const script = document.createElement("script");
      script.textContent = `console.log("${encodeKeyToInvisible(key)}")`;

      eventBus.emit("structureChanges", [script]);

      expect(map.has(script)).toBe(false);
    });

    it("should ignore style tags", () => {
      const key = registerKey("style.key");
      const style = document.createElement("style");
      style.textContent = `.class { content: "${encodeKeyToInvisible(key)}"; }`;

      eventBus.emit("structureChanges", [style]);

      expect(map.has(style)).toBe(false);
    });

    it("should ignore encoded text inside a script reached through a scanned container", () => {
      const key = registerKey("script.text");
      const container = document.createElement("div");
      const script = document.createElement("script");
      script.appendChild(document.createTextNode(`var x = "${encodeKeyToInvisible(key)}"`));
      container.appendChild(script);

      eventBus.emit("structureChanges", [container]);

      expect(map.size()).toBe(0);
    });

    it("should ignore encoded attributes on a script element", () => {
      const key = registerKey("script.aria");
      const script = document.createElement("script");
      script.setAttribute("aria-label", `Label ${encodeKeyToInvisible(key)}`);

      eventBus.emit("attributeChanges", [script]);

      expect(map.has(script)).toBe(false);
    });
  });

  describe("destroy()", () => {
    it("should stop registering translations after destroy()", () => {
      const key = registerKey("after.destroy");
      const p = document.createElement("p");
      p.appendChild(document.createTextNode(`Text ${encodeKeyToInvisible(key)}`));

      scanner.destroy();
      eventBus.emit("structureChanges", [p]);

      expect(map.has(p)).toBe(false);
    });
  });

  describe("PROCESSED_TO_PARENT_NODES handling", () => {
    it("should map option text to select parent", () => {
      const key = registerKey("option.key");
      const select = document.createElement("select");
      const option = document.createElement("option");
      const textNode = document.createTextNode(`Option ${encodeKeyToInvisible(key)}`);

      option.appendChild(textNode);
      select.appendChild(option);

      eventBus.emit("structureChanges", [select]);

      expect(registeredKeys(select)).toEqual([{ key: "option.key", ns: "default" }]);
      expect(map.has(option)).toBe(false);
    });

    it("registers an optgroup label attribute on the optgroup itself, not the select parent", () => {
      const key = registerKey("optgroup.key");
      const select = document.createElement("select");
      const optgroup = document.createElement("optgroup");
      optgroup.setAttribute("label", `Group ${encodeKeyToInvisible(key)}`);

      select.appendChild(optgroup);

      eventBus.emit("structureChanges", [select]);

      expect(map.has(select)).toBe(false);
      expect(registeredKeys(optgroup)).toEqual([{ key: "optgroup.key", ns: "default" }]);
    });
  });

  describe("Edge cases", () => {
    it("should handle elements without encoded content", () => {
      const div = document.createElement("div");
      div.textContent = "Plain text without encoding";

      eventBus.emit("structureChanges", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("should handle empty elements", () => {
      const div = document.createElement("div");

      eventBus.emit("structureChanges", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("should handle mixed encoded and plain text", () => {
      const key = registerKey("mixed.key");
      const div = document.createElement("div");
      const text1 = document.createTextNode("Plain text ");
      const text2 = document.createTextNode(`Encoded ${encodeKeyToInvisible(key)}`);
      const text3 = document.createTextNode(" More plain");

      div.appendChild(text1);
      div.appendChild(text2);
      div.appendChild(text3);

      eventBus.emit("structureChanges", [div]);

      expect([...(map.get(div)?.nodes.keys() ?? [])]).toEqual([text2]);
      expect(registeredKeys(div)).toEqual([{ key: "mixed.key", ns: "default" }]);
    });

    it.each(Object.entries(INVALID_DATA))(
      "should not register text carrying a malformed encoded id (%s)",
      (_name, malformed) => {
        const div = document.createElement("div");
        div.appendChild(document.createTextNode(`Broken ${malformed}`));

        eventBus.emit("structureChanges", [div]);

        expect(map.has(div)).toBe(false);
      },
    );
  });
});
