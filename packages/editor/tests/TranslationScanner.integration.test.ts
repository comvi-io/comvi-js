import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TranslationScanner } from "../src/TranslationScanner";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { EventBus } from "../src/EventBus";
import { BROKEN_FRAME, keyRef, marker } from "./helpers/frames";
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

  /**
   * Arrange step for removal tests: emits the scan event and fails the test
   * unless `element` really got registered, so a later "unregistered" claim
   * can never pass because nothing was registered in the first place.
   */
  function scanAndExpectRegistered(
    event: "structureChanges" | "attributeChanges",
    nodes: Node[],
    element: Element,
  ): void {
    eventBus.emit(event, nodes);
    if (!map.has(element)) {
      throw new Error(`arrangement failed: <${element.localName}> was not registered by ${event}`);
    }
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
  });

  describe("Text node processing", () => {
    it("text node with a marker → registered with its key and the visible text as preview", () => {
      const key = keyRef("text.key");
      const encoded = marker(key);

      const p = document.createElement("p");
      const textNode = document.createTextNode(`Text ${encoded}`);
      p.appendChild(textNode);

      eventBus.emit("structureChanges", [p]);

      expect(map.get(p)?.nodes.get(textNode)).toEqual({
        inst: "",
        key: "text.key",
        ns: "default",
        textPreview: "Text",
      });
    });

    it("two marked text nodes in one element → both keys registered on it, in order", () => {
      const key1 = keyRef("key1");
      const key2 = keyRef("key2");

      const div = document.createElement("div");
      const text1 = document.createTextNode(`First ${marker(key1)}`);
      const text2 = document.createTextNode(`Second ${marker(key2)}`);

      div.appendChild(text1);
      div.appendChild(text2);

      eventBus.emit("structureChanges", [div]);

      expect(registeredKeys(div)).toEqual([
        { key: "key1", ns: "default" },
        { key: "key2", ns: "default" },
      ]);
    });

    it("textChanges for a node that gained a marker → its element is registered with the key", () => {
      const key = keyRef("change.key");
      const p = document.createElement("p");
      const textNode = document.createTextNode("Initial");
      p.appendChild(textNode);
      document.body.appendChild(p);

      // Change text to include encoding
      textNode.nodeValue = `Changed ${marker(key)}`;

      eventBus.emit("textChanges", [textNode]);

      expect(registeredKeys(p)).toEqual([{ key: "change.key", ns: "default" }]);
    });

    it("registered text node rewritten without its marker → the element is unregistered", () => {
      const key = keyRef("ghost.key");
      const p = document.createElement("p");
      const textNode = document.createTextNode(`Value ${marker(key)}`);
      p.appendChild(textNode);
      scanAndExpectRegistered("structureChanges", [p], p);
      textNode.nodeValue = "Plain value";

      eventBus.emit("textChanges", [textNode]);

      expect(map.has(p)).toBe(false);
    });

    it("should ignore a non-text node reported by textChanges", () => {
      const key = keyRef("comment.key");
      const p = document.createElement("p");
      p.appendChild(document.createComment(`Comment ${marker(key)}`));

      eventBus.emit("textChanges", [p.firstChild!]);

      expect(map.has(p)).toBe(false);
    });

    it("should ignore a detached text node that has no element ancestor", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const key = keyRef("orphan.key");
      const orphan = document.createTextNode(`Orphan ${marker(key)}`);

      eventBus.emit("textChanges", [orphan]);

      expect(map.size()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("should drop only the blanked text node's registration and keep its sibling's", () => {
      const keptKey = keyRef("kept.key");
      const blankedKey = keyRef("blanked.key");
      const p = document.createElement("p");
      const keptNode = document.createTextNode(`Kept ${marker(keptKey)}`);
      const blankedNode = document.createTextNode(`Blanked ${marker(blankedKey)}`);
      p.append(keptNode, blankedNode);
      eventBus.emit("structureChanges", [p]);

      blankedNode.nodeValue = "";
      eventBus.emit("textChanges", [blankedNode]);

      expect(registeredKeys(p)).toEqual([{ key: "kept.key", ns: "default" }]);
    });

    it("should not register text whose encoded id has no key mapping", () => {
      const div = document.createElement("div");
      div.appendChild(document.createTextNode(`Ghost ${BROKEN_FRAME}`));

      eventBus.emit("structureChanges", [div]);

      expect(map.has(div)).toBe(false);
    });
  });

  describe("Attribute processing", () => {
    it("marked placeholder attribute → registered on the input", () => {
      const key = keyRef("attr.key");
      const encoded = marker(key);

      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${encoded}`);

      eventBus.emit("attributeChanges", [input]);

      expect(registeredKeys(input)).toEqual([{ key: "attr.key", ns: "default" }]);
    });

    it("three marked attributes on one input → all three keys registered, in order", () => {
      const key1 = keyRef("placeholder.key");
      const key2 = keyRef("title.key");
      const key3 = keyRef("aria.key");

      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${marker(key1)}`);
      input.setAttribute("title", `Title ${marker(key2)}`);
      input.setAttribute("aria-label", `Label ${marker(key3)}`);

      eventBus.emit("attributeChanges", [input]);

      expect(registeredKeys(input)).toEqual([
        { key: "placeholder.key", ns: "default" },
        { key: "title.key", ns: "default" },
        { key: "aria.key", ns: "default" },
      ]);
    });

    it("marked placeholder on <textarea> (tag-specific rule) → registered", () => {
      const key = keyRef("textarea.placeholder");
      const encoded = marker(key);

      const textarea = document.createElement("textarea");
      textarea.setAttribute("placeholder", `Enter text ${encoded}`);

      eventBus.emit("attributeChanges", [textarea]);

      expect(registeredKeys(textarea)).toEqual([{ key: "textarea.placeholder", ns: "default" }]);
    });

    it("marked title on <span> (universal * rule) → registered", () => {
      const key = keyRef("universal.title");
      const encoded = marker(key);

      const span = document.createElement("span");
      span.setAttribute("title", `Tooltip ${encoded}`);

      eventBus.emit("attributeChanges", [span]);

      expect(registeredKeys(span)).toEqual([{ key: "universal.title", ns: "default" }]);
    });

    it("marked value on <input type=button> (selector rule) → registered", () => {
      const key = keyRef("input.button.value");
      const encoded = marker(key);

      const inputButton = document.createElement("input");
      inputButton.setAttribute("type", "button");
      inputButton.setAttribute("value", `Click ${encoded}`);

      eventBus.emit("attributeChanges", [inputButton]);

      expect(registeredKeys(inputButton)).toEqual([{ key: "input.button.value", ns: "default" }]);
    });

    it("registered placeholder rewritten without its marker → the input is unregistered", () => {
      const key = keyRef("placeholder.key");
      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${marker(key)}`);
      scanAndExpectRegistered("attributeChanges", [input], input);
      input.setAttribute("placeholder", "Plain placeholder");

      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should remove a stale selector-matched attribute registration once its markers disappear", () => {
      const key = keyRef("submit.value");
      const input = document.createElement("input");
      input.setAttribute("type", "submit");
      input.setAttribute("value", `Send ${marker(key)}`);
      scanAndExpectRegistered("attributeChanges", [input], input);

      input.setAttribute("value", "Send");
      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should not scan an attribute that only another tag's rule lists", () => {
      const key = keyRef("stray.placeholder");
      const div = document.createElement("div");
      div.setAttribute("placeholder", `Stray ${marker(key)}`);

      eventBus.emit("attributeChanges", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("should not register an attribute whose encoded id has no key mapping", () => {
      const input = document.createElement("input");
      input.setAttribute("placeholder", `Ghost ${BROKEN_FRAME}`);

      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should not re-register an unchanged attribute on a repeated scan", () => {
      const key = keyRef("stable.key");
      const input = document.createElement("input");
      input.setAttribute("placeholder", `Placeholder ${marker(key)}`);
      eventBus.emit("attributeChanges", [input]);
      const removedSpy = vi.fn();
      eventBus.on("translationRemoved", removedSpy);

      eventBus.emit("attributeChanges", [input]);

      expect(removedSpy).not.toHaveBeenCalled();
      expect(registeredKeys(input)).toEqual([{ key: "stable.key", ns: "default" }]);
    });

    it("should skip an element's text registrations, without erroring on them, when only the attributes are re-scanned", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const textKey = keyRef("text.key");
      const attrKey = keyRef("attr.key");
      const div = document.createElement("div");
      div.setAttribute("aria-label", `Label ${marker(attrKey)}`);
      div.appendChild(document.createTextNode(`Body ${marker(textKey)}`));
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
      const key = keyRef("inplace.key");
      const input = document.createElement("input");
      const placeholder = document.createAttribute("placeholder");
      placeholder.value = `Placeholder ${marker(key)}`;
      input.setAttributeNode(placeholder);
      eventBus.emit("attributeChanges", [input]);

      placeholder.value = "Plain placeholder";
      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("should keep a registration for an attribute that leaves the element's checked set", () => {
      const key = keyRef("button.value");
      const input = document.createElement("input");
      input.setAttribute("type", "button");
      input.setAttribute("value", `Click ${marker(key)}`);
      eventBus.emit("attributeChanges", [input]);

      input.setAttribute("type", "text");
      eventBus.emit("attributeChanges", [input]);

      expect(registeredKeys(input)).toEqual([{ key: "button.value", ns: "default" }]);
    });
  });

  describe("Structure changes", () => {
    it("marked parent and child under one structureChanges root → each registered with its own key", () => {
      const key1 = keyRef("parent.key");
      const key2 = keyRef("child.key");

      const parent = document.createElement("div");
      parent.setAttribute("title", `Parent ${marker(key1)}`);

      const child = document.createElement("span");
      child.setAttribute("title", `Child ${marker(key2)}`);

      parent.appendChild(child);

      eventBus.emit("structureChanges", [parent]);

      expect(registeredKeys(parent)).toEqual([{ key: "parent.key", ns: "default" }]);
      expect(registeredKeys(child)).toEqual([{ key: "child.key", ns: "default" }]);
    });

    it("five nested levels, one marker each → five elements registered, one key each", () => {
      const root = document.createElement("div");
      let current = root;

      const levels: HTMLElement[] = [];
      for (let i = 0; i < 5; i++) {
        const child = document.createElement("div");
        child.setAttribute("title", `Level ${i} ${marker(keyRef(`level${i}`))}`);
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
      const key = keyRef("overlap.key");
      const parent = document.createElement("div");
      const child = document.createElement("span");
      const textNode = document.createTextNode(`Value ${marker(key)}`);
      child.appendChild(textNode);
      parent.appendChild(child);

      const updatedSpy = vi.fn();
      eventBus.on("translationUpdated", updatedSpy);

      eventBus.emit("structureChanges", [parent, child]);

      expect(registeredKeys(child)).toEqual([{ key: "overlap.key", ns: "default" }]);
      expect(updatedSpy).not.toHaveBeenCalled();
    });

    it("same root listed twice in one batch → registered once, no update event", () => {
      const key = keyRef("dup.key");
      const p = document.createElement("p");
      p.appendChild(document.createTextNode(`Value ${marker(key)}`));
      const updatedSpy = vi.fn();
      eventBus.on("translationUpdated", updatedSpy);

      eventBus.emit("structureChanges", [p, p]);

      expect(registeredKeys(p)).toEqual([{ key: "dup.key", ns: "default" }]);
      expect(updatedSpy).not.toHaveBeenCalled();
    });

    it("should register a text node handed directly to structureChanges", () => {
      const key = keyRef("direct.text");
      const p = document.createElement("p");
      const textNode = document.createTextNode(`Direct ${marker(key)}`);
      p.appendChild(textNode);

      eventBus.emit("structureChanges", [textNode]);

      expect(registeredKeys(p)).toEqual([{ key: "direct.text", ns: "default" }]);
    });

    it("should ignore an option element that has no parent to map onto", () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const key = keyRef("orphan.option");
      const option = document.createElement("option");
      option.appendChild(document.createTextNode(`Option ${marker(key)}`));

      eventBus.emit("structureChanges", [option]);

      expect(map.size()).toBe(0);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe("Removed nodes", () => {
    it("nodesRemoved for a registered element's only marked text node → the element is unregistered", () => {
      const key = keyRef("removed.key");
      const div = document.createElement("div");
      const textNode = document.createTextNode(`Text ${marker(key)}`);
      div.appendChild(textNode);
      scanAndExpectRegistered("structureChanges", [div], div);

      eventBus.emit("nodesRemoved", [textNode]);

      expect(map.has(div)).toBe(false);
    });

    it("nodesRemoved for a registered element → the element is unregistered", () => {
      const key = keyRef("element.key");
      const div = document.createElement("div");
      div.setAttribute("title", `Title ${marker(key)}`);
      scanAndExpectRegistered("structureChanges", [div], div);

      eventBus.emit("nodesRemoved", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("two nodes removed in one event → the registry is cleaned in one pass over both", () => {
      const cleanupSpy = vi.spyOn(map, "cleanupRemovedNodes");
      const textNode1 = document.createTextNode("a");
      const textNode2 = document.createTextNode("b");

      eventBus.emit("nodesRemoved", [textNode1, textNode2]);

      expect(cleanupSpy.mock.calls).toEqual([[new Set([textNode1, textNode2])]]);
    });
  });

  describe("IGNORED_NODES handling", () => {
    it("should ignore script tags", () => {
      const key = keyRef("script.key");
      const script = document.createElement("script");
      script.textContent = `console.log("${marker(key)}")`;

      eventBus.emit("structureChanges", [script]);

      expect(map.has(script)).toBe(false);
    });

    it("should ignore style tags", () => {
      const key = keyRef("style.key");
      const style = document.createElement("style");
      style.textContent = `.class { content: "${marker(key)}"; }`;

      eventBus.emit("structureChanges", [style]);

      expect(map.has(style)).toBe(false);
    });

    it("should ignore encoded text inside a script reached through a scanned container", () => {
      const key = keyRef("script.text");
      const container = document.createElement("div");
      const script = document.createElement("script");
      script.appendChild(document.createTextNode(`var x = "${marker(key)}"`));
      container.appendChild(script);

      eventBus.emit("structureChanges", [container]);

      expect(map.size()).toBe(0);
    });

    it("should ignore encoded attributes on a script element", () => {
      const key = keyRef("script.aria");
      const script = document.createElement("script");
      script.setAttribute("aria-label", `Label ${marker(key)}`);

      eventBus.emit("attributeChanges", [script]);

      expect(map.has(script)).toBe(false);
    });
  });

  describe("destroy()", () => {
    it("should stop registering translations after destroy()", () => {
      const key = keyRef("after.destroy");
      const p = document.createElement("p");
      p.appendChild(document.createTextNode(`Text ${marker(key)}`));

      scanner.destroy();
      eventBus.emit("structureChanges", [p]);

      expect(map.has(p)).toBe(false);
    });
  });

  describe("PROCESSED_TO_PARENT_NODES handling", () => {
    it("should map option text to select parent", () => {
      const key = keyRef("option.key");
      const select = document.createElement("select");
      const option = document.createElement("option");
      const textNode = document.createTextNode(`Option ${marker(key)}`);

      option.appendChild(textNode);
      select.appendChild(option);

      eventBus.emit("structureChanges", [select]);

      expect(registeredKeys(select)).toEqual([{ key: "option.key", ns: "default" }]);
      expect(map.has(option)).toBe(false);
    });

    it("registers an optgroup label attribute on the optgroup itself, not the select parent", () => {
      const key = keyRef("optgroup.key");
      const select = document.createElement("select");
      const optgroup = document.createElement("optgroup");
      optgroup.setAttribute("label", `Group ${marker(key)}`);

      select.appendChild(optgroup);

      eventBus.emit("structureChanges", [select]);

      expect(map.has(select)).toBe(false);
      expect(registeredKeys(optgroup)).toEqual([{ key: "optgroup.key", ns: "default" }]);
    });
  });

  describe("Edge cases", () => {
    it("element with plain text only → not registered", () => {
      const div = document.createElement("div");
      div.textContent = "Plain text without encoding";

      eventBus.emit("structureChanges", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("empty element → not registered", () => {
      const div = document.createElement("div");

      eventBus.emit("structureChanges", [div]);

      expect(map.has(div)).toBe(false);
    });

    it("plain and marked text nodes mixed → only the marked node is registered", () => {
      const key = keyRef("mixed.key");
      const div = document.createElement("div");
      const text1 = document.createTextNode("Plain text ");
      const text2 = document.createTextNode(`Encoded ${marker(key)}`);
      const text3 = document.createTextNode(" More plain");

      div.appendChild(text1);
      div.appendChild(text2);
      div.appendChild(text3);

      eventBus.emit("structureChanges", [div]);

      expect([...(map.get(div)?.nodes.keys() ?? [])]).toEqual([text2]);
      expect(registeredKeys(div)).toEqual([{ key: "mixed.key", ns: "default" }]);
    });

    it.each(Object.entries(INVALID_DATA))(
      "should not register text carrying a malformed frame (%s)",
      (_name, malformed) => {
        const div = document.createElement("div");
        div.appendChild(document.createTextNode(`Broken ${malformed}`));

        eventBus.emit("structureChanges", [div]);

        expect(map.has(div)).toBe(false);
      },
    );
  });

  describe("several markers in one node", () => {
    const mk = (key: string, ns?: string): string => marker(keyRef(key, ns));

    it("one text node rendering two translations → both keys tracked, each with its own preview", () => {
      const p = document.createElement("p");
      const text = document.createTextNode(`Hello${mk("hello")} Bye${mk("bye", "farewells")}`);
      p.appendChild(text);

      eventBus.emit("structureChanges", [p]);

      expect(map.get(p)?.nodes.get(text)).toEqual({
        inst: "",
        key: "hello",
        ns: "default",
        textPreview: "Hello",
        markers: [
          { inst: "", key: "hello", ns: "default", textPreview: "Hello" },
          { inst: "", key: "bye", ns: "farewells", textPreview: "Bye" },
        ],
      });
    });

    it("one attribute composed from two translations → both keys tracked", () => {
      const input = document.createElement("input");
      input.setAttribute("title", `Save${mk("save")} or cancel${mk("cancel")}`);

      eventBus.emit("structureChanges", [input]);

      expect(map.get(input)?.nodes.get(input.getAttributeNode("title")!)?.markers).toEqual([
        { inst: "", key: "save", ns: "default", textPreview: "Save" },
        { inst: "", key: "cancel", ns: "default", textPreview: "or cancel" },
      ]);
    });

    it("the same key twice in one text node → tracked once, without a marker list", () => {
      const p = document.createElement("p");
      const text = document.createTextNode(`A${mk("same")} B${mk("same")}`);
      p.appendChild(text);

      eventBus.emit("structureChanges", [p]);

      expect(map.get(p)?.nodes.get(text)).toEqual({
        inst: "",
        key: "same",
        ns: "default",
        textPreview: "A B",
      });
    });

    it("a marker split across adjacent text nodes → tracked on the node where it starts", () => {
      const encoded = mk("hello");
      const p = document.createElement("p");
      const head = document.createTextNode(`Hello${encoded.slice(0, 3)}`);
      const tail = document.createTextNode(encoded.slice(3));
      p.append(head, tail);

      eventBus.emit("structureChanges", [p]);

      expect(registeredKeys(p)).toEqual([{ key: "hello", ns: "default" }]);
    });

    it("attribute marker replaced in place by a broken fragment → the attribute is unregistered", () => {
      // A browser updates the existing Attr and reports an attribute mutation.
      // happy-dom swaps in a new Attr on setAttribute and reports nothing for
      // an in-place Attr.value change, so the watcher's event is emitted here.
      const encoded = mk("save");
      const input = document.createElement("input");
      input.setAttribute("title", `Save${encoded}`);
      eventBus.emit("structureChanges", [input]);

      input.getAttributeNode("title")!.value = `Save${encoded.slice(0, 3)}`;
      eventBus.emit("attributeChanges", [input]);

      expect(map.has(input)).toBe(false);
    });

    it("a lone marker fragment → nothing tracked", () => {
      const encoded = mk("hello");
      const p = document.createElement("p");
      p.append(document.createElement("br"), document.createTextNode(`${encoded.slice(3)}tail`));

      eventBus.emit("structureChanges", [p]);

      expect(map.has(p)).toBe(false);
    });
  });
});
