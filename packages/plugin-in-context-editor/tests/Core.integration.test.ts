/**
 * The real Core over a real DOM, read through what a translator sees: the
 * Alt+hover tooltip, whose text is the key the scanner decoded onto the element.
 * `Core.getRegistry()` exposes the decoded data itself.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Core, type EditorI18n } from "../src/Core";
import { encodeKeyToInvisible, registerKey, loadKeyMappings } from "../src/translation";
import { TAG_ATTRIBUTES } from "../src/constants";
import {
  cleanupDOM,
  flushDOMMutations,
  getActiveOverlay,
  simulateKeyEvent,
  simulateMouseEvent,
} from "./helpers";
import { hoverLabelNow as hoverLabel } from "./helpers/editorPage";

/** Every Core a test built, stopped afterwards so a failed assertion leaks no runtime. */
const cores: Core[] = [];
function startCore(...args: ConstructorParameters<typeof Core>): Core {
  const core = new Core(...args);
  cores.push(core);
  core.start();
  return core;
}

function renderTarget(tag = "div"): HTMLElement {
  const container = document.createElement(tag);
  document.body.appendChild(container);
  return container;
}

function markedHeading(key: string): HTMLHeadingElement {
  const h1 = document.createElement("h1");
  h1.appendChild(document.createTextNode(`Welcome ${encodeKeyToInvisible(registerKey(key))}`));
  return h1;
}

function withMarkedAttribute<T extends HTMLElement>(element: T, name: string, key: string): T {
  element.setAttribute(name, `Text ${encodeKeyToInvisible(registerKey(key))}`);
  return element;
}

describe("Core end-to-end", () => {
  afterEach(() => {
    for (const core of cores.splice(0)) core.stop();
    cleanupDOM();
    loadKeyMappings({});
  });

  describe("scanning marked content", () => {
    it("marked text node in the target at start() → shows its key on Alt+hover", async () => {
      const container = renderTarget();
      const h1 = markedHeading("home.title");
      container.append(h1);

      startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      await flushDOMMutations();

      expect(hoverLabel(h1)).toBe("home.title (default)");
    });

    it("marked title attribute in the target at start() → shows its key on Alt+hover", async () => {
      const container = renderTarget();
      const p = withMarkedAttribute(document.createElement("p"), "title", "home.description");
      container.append(p);

      startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      await flushDOMMutations();

      expect(hoverLabel(p)).toBe("home.description (default)");
    });

    it("marked element appended after start() → shows its key on Alt+hover", async () => {
      const container = renderTarget();
      startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      const newDiv = withMarkedAttribute(
        document.createElement("div"),
        "aria-label",
        "dynamic.key",
      );

      container.appendChild(newDiv);
      await flushDOMMutations();

      expect(hoverLabel(newDiv)).toBe("dynamic.key (default)");
    });

    it("three elements with different keys → each shows its own key on Alt+hover", async () => {
      const container = renderTarget();
      startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      const divs = ["key1", "key2", "key3"].map((key) =>
        withMarkedAttribute(document.createElement("div"), "title", key),
      );

      container.append(...divs);
      await flushDOMMutations();

      expect(divs.map(hoverLabel)).toEqual(["key1 (default)", "key2 (default)", "key3 (default)"]);
    });

    it("marked heading scanned → getRegistry() lists exactly that element", async () => {
      const container = renderTarget();
      const h1 = markedHeading("home.title");
      container.appendChild(h1);

      const core = startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      await flushDOMMutations();

      expect([...core.getRegistry().getElements()]).toEqual([h1]);
    });

    it("key in the host's default namespace → the hover label omits the namespace suffix", async () => {
      const host = { getDefaultNamespace: () => "default" } as unknown as EditorI18n;
      const container = renderTarget();
      const h1 = markedHeading("home.title");
      container.appendChild(h1);

      startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES }, host);
      await flushDOMMutations();

      expect(hoverLabel(h1)).toBe("home.title");
    });
  });

  describe("lifecycle", () => {
    it("start() then stop() → neither throws", () => {
      const core = new Core({ targetElement: renderTarget(), tagAttributes: TAG_ATTRIBUTES });

      expect(() => {
        core.start();
        core.stop();
      }).not.toThrow();
    });

    it("five start()/stop() cycles on one Core → none throws", () => {
      const core = new Core({ targetElement: renderTarget(), tagAttributes: TAG_ATTRIBUTES });

      expect(() => {
        for (let i = 0; i < 5; i++) {
          core.start();
          core.stop();
        }
      }).not.toThrow();
    });

    it("Core built with no options → start() and stop() do not throw", () => {
      const core = new Core();

      expect(() => {
        core.start();
        core.stop();
      }).not.toThrow();
    });
  });

  describe("after stop()", () => {
    it("marked element appended after stop() → no key on Alt+hover", async () => {
      const container = renderTarget();
      const core = startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      core.stop();
      const div = withMarkedAttribute(document.createElement("div"), "title", "after.stop");

      container.appendChild(div);
      await flushDOMMutations();

      expect(hoverLabel(div)).toBeNull();
    });

    it("stopped while the pointer rests on marked text → pressing Alt draws no overlay", async () => {
      const container = renderTarget();
      const heading = markedHeading("home.title");
      container.appendChild(heading);
      const core = startCore({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
      await flushDOMMutations();
      simulateMouseEvent(heading, "mouseover");
      core.stop();

      simulateKeyEvent("keydown", "Alt");

      expect(getActiveOverlay()).toBeNull();
    });
  });

  describe("configuration options", () => {
    it("custom targetElement → marked content inside it shows its key", async () => {
      const customTarget = renderTarget("section");
      startCore({ targetElement: customTarget, tagAttributes: TAG_ATTRIBUTES });
      const inside = withMarkedAttribute(document.createElement("div"), "title", "inside.key");

      customTarget.appendChild(inside);
      await flushDOMMutations();

      expect(hoverLabel(inside)).toBe("inside.key (default)");
    });

    it("custom targetElement → marked content outside it shows no key", async () => {
      const customTarget = renderTarget("section");
      const outside = renderTarget();
      startCore({ targetElement: customTarget, tagAttributes: TAG_ATTRIBUTES });

      withMarkedAttribute(outside, "title", "outside.key");
      await flushDOMMutations();

      expect(hoverLabel(outside)).toBeNull();
    });

    it("custom tagAttributes naming data-custom → a marked data-custom attribute shows its key", async () => {
      const container = renderTarget();
      startCore({ targetElement: container, tagAttributes: { div: ["data-custom"] } });
      const watched = withMarkedAttribute(
        document.createElement("div"),
        "data-custom",
        "custom.key",
      );

      container.append(watched);
      await flushDOMMutations();

      expect(hoverLabel(watched)).toBe("custom.key (default)");
    });

    it("custom tagAttributes without title → a marked title attribute shows no key", async () => {
      const container = renderTarget();
      startCore({ targetElement: container, tagAttributes: { div: ["data-custom"] } });
      const unwatched = withMarkedAttribute(document.createElement("div"), "title", "title.key");

      container.append(unwatched);
      await flushDOMMutations();

      expect(hoverLabel(unwatched)).toBeNull();
    });

    it("tagAttributes: undefined → the default rules apply and a marked placeholder shows its key", async () => {
      // Regression: undefined tagAttributes used to crash with
      // "Cannot read properties of undefined (reading 'body')".
      const container = renderTarget();
      startCore({ targetElement: container, tagAttributes: undefined });
      const input = withMarkedAttribute(document.createElement("input"), "placeholder", "test.key");

      container.appendChild(input);
      await flushDOMMutations();

      expect(hoverLabel(input)).toBe("test.key (default)");
    });

    it("empty options → the default rules apply to a marked <textarea> placeholder", async () => {
      const container = renderTarget();
      startCore({});
      const textarea = withMarkedAttribute(
        document.createElement("textarea"),
        "placeholder",
        "test.placeholder",
      );

      container.append(textarea);
      await flushDOMMutations();

      expect(hoverLabel(textarea)).toBe("test.placeholder (default)");
    });

    it("empty options → the default rules apply to a marked aria-label", async () => {
      const container = renderTarget();
      startCore({});
      const div = withMarkedAttribute(document.createElement("div"), "aria-label", "test.aria");

      container.append(div);
      await flushDOMMutations();

      expect(hoverLabel(div)).toBe("test.aria (default)");
    });
  });
});
