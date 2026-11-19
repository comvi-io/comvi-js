/**
 * `src/constants` is a table of values other code and other repos depend on:
 * which attributes the scanner reads, which tags it refuses to touch, and the
 * DOM attribute that marks the editor's own shadow hosts. Each entry is pinned
 * through the behaviour it drives, so an accidental edit fails here rather than
 * silently making a tag or an ARIA attribute uneditable.
 *
 * The module graph is re-imported per test (as `tests/main.test.ts` does for
 * its module-level handle): these constants are evaluated once at module load,
 * and a suite that only reads the copy imported at collection time is pinning a
 * snapshot taken before the test ever ran.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupDOM } from "./helpers";

/** Every (element, attribute) pair `TAG_ATTRIBUTES` promises the scanner reads. */
const SCANNED_ATTRIBUTES: ReadonlyArray<{
  subject: string;
  tag: string;
  type?: string;
  attribute: string;
}> = [
  { subject: "textarea", tag: "textarea", attribute: "placeholder" },
  { subject: "input", tag: "input", attribute: "placeholder" },
  { subject: "input", tag: "input", attribute: "alt" },
  { subject: "input", tag: "input", attribute: "title" },
  { subject: "input[type=button]", tag: "input", type: "button", attribute: "value" },
  { subject: "input[type=submit]", tag: "input", type: "submit", attribute: "value" },
  { subject: "input[type=reset]", tag: "input", type: "reset", attribute: "value" },
  { subject: "img", tag: "img", attribute: "alt" },
  { subject: "option", tag: "option", attribute: "label" },
  { subject: "optgroup", tag: "optgroup", attribute: "label" },
  { subject: "table", tag: "table", attribute: "summary" },
  { subject: "th", tag: "th", attribute: "abbr" },
  { subject: "td", tag: "td", attribute: "abbr" },
  { subject: "any element", tag: "div", attribute: "aria-label" },
  { subject: "any element", tag: "div", attribute: "aria-description" },
  { subject: "any element", tag: "div", attribute: "aria-placeholder" },
  { subject: "any element", tag: "div", attribute: "aria-valuetext" },
  { subject: "any element", tag: "div", attribute: "title" },
];

/** The tags the scanner must never read a key out of. */
const IGNORED_TAGS = ["script", "style"] as const;

type Subjects = {
  constants: typeof import("../src/constants");
  scanner: import("../src/TranslationScanner").TranslationScanner;
  registry: import("../src/TranslationRegistry").TranslationRegistry;
  emitStructureChange: (node: Node) => void;
  encode: (key: string) => string;
  resetEncoder: () => void;
  findCorrespondingNode: typeof import("../src/utils").findCorrespondingNode;
  createShadowDomContainer: typeof import("../src/utils/shadowDom").createShadowDomContainer;
};

describe("src/constants", () => {
  let subjects: Subjects;

  /** The (attribute, key) pairs the scanner decoded onto `element`. */
  function decodedAttributes(element: Element): Array<{ attribute: string; key: string }> {
    return [...(subjects.registry.get(element)?.nodes.entries() ?? [])].map(([node, info]) => ({
      attribute: (node as Attr).name,
      key: info.key,
    }));
  }

  beforeEach(async () => {
    vi.resetModules();
    const [constants, scannerModule, registryModule, busModule, translation, utils, shadowDom] =
      await Promise.all([
        import("../src/constants"),
        import("../src/TranslationScanner"),
        import("../src/TranslationRegistry"),
        import("../src/EventBus"),
        import("../src/translation"),
        import("../src/utils"),
        import("../src/utils/shadowDom"),
      ]);

    const eventBus = new busModule.EventBus();
    const registry = new registryModule.TranslationRegistry(eventBus);

    subjects = {
      constants,
      registry,
      scanner: new scannerModule.TranslationScanner(eventBus, registry, {
        targetElement: document,
        tagAttributes: constants.TAG_ATTRIBUTES,
      }),
      emitStructureChange: (node) => eventBus.emit("structureChanges", [node]),
      encode: (key) => translation.encodeKeyToInvisible(translation.registerKey(key)),
      resetEncoder: translation.resetEncoder,
      findCorrespondingNode: utils.findCorrespondingNode,
      createShadowDomContainer: shadowDom.createShadowDomContainer,
    };
  });

  afterEach(() => {
    subjects.scanner.destroy();
    subjects.resetEncoder();
    cleanupDOM();
  });

  describe("TAG_ATTRIBUTES", () => {
    it.each(SCANNED_ATTRIBUTES)(
      "reads the $attribute attribute of $subject",
      ({ tag, type, attribute }) => {
        const element = document.createElement(tag);
        if (type) {
          element.setAttribute("type", type);
        }
        element.setAttribute(attribute, `Label ${subjects.encode("attr.key")}`);

        subjects.emitStructureChange(element);

        expect(decodedAttributes(element)).toEqual([{ attribute, key: "attr.key" }]);
      },
    );

    it("leaves an attribute the element's own entry does not list unread", () => {
      const div = document.createElement("div");
      div.setAttribute("placeholder", `Label ${subjects.encode("attr.key")}`);

      subjects.emitStructureChange(div);

      expect(subjects.registry.has(div)).toBe(false);
    });
  });

  describe("IGNORED_NODES", () => {
    it.each(IGNORED_TAGS)("never reads inside a <%s>", (tag) => {
      const element = document.createElement(tag);
      element.textContent = `Text ${subjects.encode("ignored.key")}`;

      subjects.emitStructureChange(element);

      expect(subjects.constants.IGNORED_NODES).toContain(tag);
      expect(subjects.registry.has(element)).toBe(false);
    });

    it("reads a tag that is not on the ignore list", () => {
      const paragraph = document.createElement("p");
      paragraph.textContent = `Text ${subjects.encode("read.key")}`;

      subjects.emitStructureChange(paragraph);

      expect(subjects.constants.IGNORED_NODES).toEqual([...IGNORED_TAGS]);
      expect(subjects.registry.has(paragraph)).toBe(true);
    });
  });

  describe("PROCESSED_TO_PARENT_NODES", () => {
    it("names exactly the tags findCorrespondingNode re-homes onto their parent", () => {
      const select = document.createElement("select");
      const option = document.createElement("option");
      const optgroup = document.createElement("optgroup");
      select.append(option, optgroup);
      const ordinary = document.createElement("span");

      expect(subjects.constants.PROCESSED_TO_PARENT_NODES).toEqual(["option", "optgroup"]);
      expect(subjects.findCorrespondingNode(option)).toBe(select);
      expect(subjects.findCorrespondingNode(optgroup)).toBe(select);
      expect(subjects.findCorrespondingNode(ordinary)).toBe(ordinary);
    });
  });

  describe("EDITOR_UI_SHADOW_HOST_ATTRIBUTE", () => {
    it("marks the editor's shadow hosts with the published attribute name", () => {
      const { container } = subjects.createShadowDomContainer();

      // Pinned as a literal: the extension and page-level CSS select on this
      // name, so renaming the constant alone must not rename the DOM contract.
      expect(document.body.querySelector("[data-comvi-editor-ui-shadow-host]")).toBe(container);
      expect(subjects.constants.EDITOR_UI_SHADOW_HOST_ATTRIBUTE).toBe(
        "data-comvi-editor-ui-shadow-host",
      );
    });
  });
});
