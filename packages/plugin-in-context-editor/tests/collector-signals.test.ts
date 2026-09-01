import { describe, it, expect, afterEach } from "vitest";
import {
  buildNeighborCandidates,
  extractConstraintSignals,
  extractSemanticSignals,
  MAX_NEIGHBOR_DISTANCE,
} from "../src/collector/signals";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";
import type { ElementWithMeta, SemanticSignals } from "../src/collector/types";

function withMeta(
  element: Element,
  namespace: string,
  key: string,
  rect: Partial<DOMRect>,
  readingOrderIndex = 0,
): ElementWithMeta & { semantic: SemanticSignals } {
  mockBoundingClientRect(element, rect);
  const r = element.getBoundingClientRect();
  return {
    element,
    namespace,
    key,
    rect: r,
    centerPoint: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    readingOrderIndex,
    semantic: extractSemanticSignals(element),
  };
}

/**
 * Builds `tags[0] > tags[1] > … > innermost` with createElement, not innerHTML:
 * the HTML parser hoists a <button> out of a <table>, which would silently
 * change the ancestry under test.
 */
function buildChain(...tags: string[]): HTMLElement {
  const nodes = tags.map((tag) => document.createElement(tag));
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i]!.appendChild(nodes[i + 1]!);
  }
  document.body.appendChild(nodes[0]!);
  return nodes[nodes.length - 1]!;
}

/** A 20x10 box whose centre point is exactly (centerX, centerY). */
function boxAt(centerX: number, centerY: number): Partial<DOMRect> {
  return {
    left: centerX - 10,
    right: centerX + 10,
    top: centerY - 5,
    bottom: centerY + 5,
    width: 20,
    height: 10,
  };
}

describe("collector/signals", () => {
  afterEach(() => {
    cleanupDOM();
  });

  describe("extractSemanticSignals — no rendered text ever leaves (RC4)", () => {
    it("resolves button role and never carries aria-label text, only presence", () => {
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Delete my account permanently, user@example.com");
      document.body.appendChild(button);

      const signals = extractSemanticSignals(button);

      expect(signals.semanticRole).toBe("button");
      expect(signals.hasAriaLabel).toBe(true);
      expect(JSON.stringify(signals)).not.toContain("user@example.com");
      expect(JSON.stringify(signals)).not.toContain("Delete my account");
    });

    it("container title becomes a boolean, never the heading text", () => {
      const dialog = document.createElement("dialog");
      const heading = document.createElement("h2");
      heading.textContent = "Confirm Jane Doe's subscription cancellation";
      dialog.appendChild(heading);
      const button = document.createElement("button");
      dialog.appendChild(button);
      document.body.appendChild(dialog);

      const signals = extractSemanticSignals(button);

      expect(signals.ancestry).toContainEqual({
        tag: "dialog",
        role: null,
        containerType: "dialog",
        hasTitle: true,
      });
      expect(JSON.stringify(signals)).not.toContain("Jane Doe");
    });

    it("stays unknown for a plain div with no semantic markers (never scanned for its own text)", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      const signals = extractSemanticSignals(div);

      expect(signals.semanticRole).toBe("unknown");
    });

    it("falls back to body-text for a stop-tag with no matching switch case and no cursor pointer", () => {
      // `legend`/`summary`/`th` are semantic stop-tags without an explicit
      // inferSemanticRole() case — they fall through to the body-text default.
      const legend = document.createElement("legend");
      document.body.appendChild(legend);
      const signals = extractSemanticSignals(legend);

      expect(signals.semanticRole).toBe("body-text");
    });
  });

  describe("extractConstraintSignals", () => {
    it("buckets a narrow, nowrap element as mustBeShort/singleLine/tiny", () => {
      const span = document.createElement("span");
      span.style.whiteSpace = "nowrap";
      span.style.overflow = "hidden";
      span.style.textOverflow = "ellipsis";
      document.body.appendChild(span);
      mockBoundingClientRect(span, {
        width: 60,
        height: 16,
        top: 0,
        left: 0,
        right: 60,
        bottom: 16,
      });

      const constraints = extractConstraintSignals(span, span.getBoundingClientRect());

      expect(constraints.hard.widthBucket).toBe("tiny");
      expect(constraints.hard.mustBeShort).toBe(true);
      expect(constraints.hard.singleLine).toBe(true);
    });

    it("buckets a wide element as full width, not truncated", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, {
        width: 800,
        height: 40,
        top: 0,
        left: 0,
        right: 800,
        bottom: 40,
      });

      const constraints = extractConstraintSignals(div, div.getBoundingClientRect());

      expect(constraints.hard.widthBucket).toBe("full");
      expect(constraints.hard.mustBeShort).toBe(false);
    });

    it("buckets a zero-width element as tiny and mustBeShort", () => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 });

      const constraints = extractConstraintSignals(div, div.getBoundingClientRect());

      expect(constraints.hard.widthBucket).toBe("tiny");
      expect(constraints.hard.mustBeShort).toBe(true);
    });

    it("flags likelyTruncated for a clipped, wrapping element and clears it once nowrap is set", () => {
      const wrapping = document.createElement("div");
      wrapping.style.overflow = "hidden";
      const clamped = document.createElement("div");
      clamped.style.overflow = "hidden";
      clamped.style.whiteSpace = "nowrap";
      document.body.append(wrapping, clamped);
      const rect = { width: 200, height: 40, top: 0, left: 0, right: 200, bottom: 40 };
      mockBoundingClientRect(wrapping, rect);
      mockBoundingClientRect(clamped, rect);

      const wrappingSoft = extractConstraintSignals(
        wrapping,
        wrapping.getBoundingClientRect(),
      ).soft;
      const clampedSoft = extractConstraintSignals(clamped, clamped.getBoundingClientRect()).soft;

      expect(wrappingSoft).toEqual({
        likelyTruncated: true,
        visuallyCompact: true,
        visualProminence: "medium",
      });
      expect(clampedSoft.likelyTruncated).toBe(false);
    });
  });

  describe("buildNeighborCandidates — client-side drop filter (RC4/2g)", () => {
    it("never includes rawText, only length, and only {namespace,key} refs", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 100,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 120,
      });
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", {
        top: 70,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 90,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ namespace: "ns", key: "neighbor.key" });
      // The wire NeighborRef carries exactly {namespace, key, semanticRole,
      // relativePosition, containerType, sameContainerAs, distance,
      // readingOrderIndex} — no rawText, no textLength, no ariaRole/hasAriaLabel.
      expect(Object.keys(candidates[0]!).sort()).toEqual([
        "containerType",
        "distance",
        "key",
        "namespace",
        "readingOrderIndex",
        "relativePosition",
        "sameContainerAs",
        "semanticRole",
      ]);
      expect(JSON.stringify(candidates)).not.toContain("Email address");
    });

    it("drops a neighbor whose local text looks like PII (phone-shaped digit run)", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      neighbor.textContent = "5551234567";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
      });
      const neighborMeta = withMeta(neighbor, "ns", "pii.key", {
        top: 25,
        left: 0,
        width: 100,
        height: 20,
        right: 100,
        bottom: 45,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toHaveLength(0);
    });

    it("drops generic-noise text unless the neighbor is a heading or label", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      neighbor.textContent = "OK";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
      });
      const neighborMeta = withMeta(neighbor, "ns", "ok.key", {
        top: 25,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 45,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toHaveLength(0);
    });

    it("keeps a heading neighbor even if its text matches generic noise", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("h3");
      neighbor.textContent = "OK";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 30,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 50,
      });
      const neighborMeta = withMeta(neighbor, "ns", "heading.key", {
        top: 0,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 20,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates.map((c) => c.key)).toEqual(["heading.key"]);
    });

    it("drops a neighbor beyond MAX_NEIGHBOR_DISTANCE", () => {
      const target = document.createElement("button");
      const far = document.createElement("span");
      far.textContent = "far away";
      document.body.append(target, far);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
      });
      const farMeta = withMeta(far, "ns", "far.key", {
        top: 2000,
        left: 2000,
        width: 30,
        height: 20,
        right: 2030,
        bottom: 2020,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, farMeta]);

      expect(candidates).toEqual([]);
    });

    it("dedupes repeated (namespace,key) neighbors down to a single candidate", () => {
      const target = document.createElement("button");
      const dupeA = document.createElement("span");
      const dupeB = document.createElement("span");
      document.body.append(target, dupeA, dupeB);

      const targetMeta = withMeta(target, "ns", "target.key", {
        top: 0,
        left: 0,
        width: 50,
        height: 20,
        right: 50,
        bottom: 20,
      });
      const dupeAMeta = withMeta(dupeA, "ns", "dupe.key", {
        top: 25,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 45,
      });
      const dupeBMeta = withMeta(dupeB, "ns", "dupe.key", {
        top: 50,
        left: 0,
        width: 30,
        height: 20,
        right: 30,
        bottom: 70,
      });

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, dupeAMeta, dupeBMeta]);

      expect(candidates.map((c) => c.key)).toEqual(["dupe.key"]);
    });
  });

  describe("extractSemanticSignals() — primary element detection", () => {
    it.each([
      ["button", "button"],
      ["a", "link"],
      ["label", "label"],
      ["input", "input"],
      ["textarea", "input"],
      ["select", "input"],
      ["h1", "heading"],
      ["h2", "heading"],
      ["h3", "heading"],
      ["h4", "heading"],
      ["h5", "heading"],
      ["h6", "heading"],
      ["th", "body-text"],
      ["caption", "caption"],
      ["figcaption", "caption"],
      ["legend", "body-text"],
      ["summary", "body-text"],
      ["dt", "caption"],
      ["li", "menu-item"],
    ])("<%s> is a semantic stop tag → semanticRole %s", (tag, expected) => {
      const element = document.createElement(tag);
      document.body.appendChild(element);

      expect(extractSemanticSignals(element).semanticRole).toBe(expected);
    });

    it("reports every signal of a bare button, with no ancestry above it", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      const signals = extractSemanticSignals(button);

      expect(signals).toEqual({
        semanticRole: "button",
        ariaRole: null,
        hasAriaLabel: false,
        htmlType: "submit",
        hasPlaceholder: false,
        ancestry: [{ tag: "button", role: null, containerType: "generic", hasTitle: false }],
      });
    });

    it("treats a div the app made clickable as a button", () => {
      const div = document.createElement("div");
      div.style.cursor = "pointer";
      document.body.appendChild(div);

      expect(extractSemanticSignals(div).semanticRole).toBe("button");
    });

    it("reports nothing but the unknown default for a div with no semantic marker", () => {
      const div = document.createElement("div");
      div.setAttribute("role", "alert");
      document.body.appendChild(div);

      expect(extractSemanticSignals(div)).toEqual({
        semanticRole: "unknown",
        ariaRole: null,
        hasAriaLabel: false,
        htmlType: null,
        hasPlaceholder: false,
        ancestry: [],
      });
    });
  });

  describe("extractSemanticSignals() — ARIA role inference", () => {
    it("prefers the link role over the generic interactive-role fallback", () => {
      const div = document.createElement("div");
      div.setAttribute("role", "link");
      document.body.appendChild(div);

      const signals = extractSemanticSignals(div);

      expect(signals.semanticRole).toBe("link");
      expect(signals.ariaRole).toBe("link");
    });

    it.each(["menuitem", "menuitemcheckbox", "menuitemradio"])(
      "role=%s → semanticRole menu-item, not the interactive-role button fallback",
      (role) => {
        const div = document.createElement("div");
        div.setAttribute("role", role);
        document.body.appendChild(div);

        expect(extractSemanticSignals(div).semanticRole).toBe("menu-item");
      },
    );

    it.each([
      ["button", "button"],
      ["checkbox", "button"],
      ["radio", "button"],
      ["switch", "button"],
      ["tab", "button"],
      ["option", "button"],
      ["combobox", "button"],
    ])("interactive role=%s on a div → semanticRole %s", (role, expected) => {
      const div = document.createElement("div");
      div.setAttribute("role", role);
      document.body.appendChild(div);

      expect(extractSemanticSignals(div).semanticRole).toBe(expected);
    });

    it.each([
      ["alert", "alert"],
      ["status", "alert"],
      ["tooltip", "tooltip"],
      ["heading", "heading"],
    ])("role=%s on a list item overrides its tag → semanticRole %s", (role, expected) => {
      const item = document.createElement("li");
      item.setAttribute("role", role);
      document.body.appendChild(item);

      expect(extractSemanticSignals(item).semanticRole).toBe(expected);
    });

    it("falls back to the tag when the role is not one the collector knows", () => {
      const heading = document.createElement("h2");
      heading.setAttribute("role", "presentation");
      document.body.appendChild(heading);

      expect(extractSemanticSignals(heading).semanticRole).toBe("heading");
    });
  });

  describe("extractSemanticSignals() — input metadata", () => {
    it("reports a non-default input type and the presence of a placeholder", () => {
      const input = document.createElement("input");
      input.type = "email";
      input.placeholder = "jane@example.com";
      document.body.appendChild(input);

      const signals = extractSemanticSignals(input);

      expect(signals.htmlType).toBe("email");
      expect(signals.hasPlaceholder).toBe(true);
      expect(JSON.stringify(signals)).not.toContain("jane@example.com");
    });

    it("omits the default text type and reports a missing placeholder", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);

      const signals = extractSemanticSignals(input);

      expect(signals.htmlType).toBeNull();
      expect(signals.hasPlaceholder).toBe(false);
    });

    it.each(["submit", "button"])("input[type=%s] → semanticRole button", (type) => {
      const input = document.createElement("input");
      input.type = type;
      document.body.appendChild(input);

      expect(extractSemanticSignals(input).semanticRole).toBe("button");
    });
  });

  describe("extractSemanticSignals() — aria-label resolution", () => {
    it("counts aria-labelledby as a label when it resolves to an element", () => {
      const label = document.createElement("span");
      label.id = "checkout-label";
      label.textContent = "Pay Jane Doe";
      const button = document.createElement("button");
      button.setAttribute("aria-labelledby", "checkout-label");
      document.body.append(label, button);

      const signals = extractSemanticSignals(button);

      expect(signals.hasAriaLabel).toBe(true);
      expect(JSON.stringify(signals)).not.toContain("Pay Jane Doe");
    });

    it("does not count aria-labelledby that points at a missing id", () => {
      const button = document.createElement("button");
      button.setAttribute("aria-labelledby", "does-not-exist");
      document.body.appendChild(button);

      expect(extractSemanticSignals(button).hasAriaLabel).toBe(false);
    });
  });

  describe("extractSemanticSignals() — ancestry containers", () => {
    const primaryButton = { tag: "button", role: null, containerType: "generic", hasTitle: false };

    it.each([
      ["dialog", "dialog"],
      ["form", "form"],
      ["fieldset", "fieldset"],
      ["table", "table"],
      ["thead", "table"],
      ["tbody", "table"],
      ["nav", "nav"],
    ])("<%s> ancestor → containerType %s", (tag, expected) => {
      const button = buildChain(tag, "button");

      expect(extractSemanticSignals(button).ancestry).toEqual([
        primaryButton,
        { tag, role: null, containerType: expected, hasTitle: false },
      ]);
    });

    it.each(["aside", "header", "footer", "main"])(
      "<%s> ancestor is generic and only kept because it carries a title",
      (tag) => {
        const button = buildChain(tag, "button");
        button.parentElement!.setAttribute("aria-label", "Account tools");

        expect(extractSemanticSignals(button).ancestry).toEqual([
          primaryButton,
          { tag, role: null, containerType: "generic", hasTitle: true },
        ]);
      },
    );

    it("leaves an untitled generic container out of the ancestry", () => {
      const button = buildChain("main", "button");

      expect(extractSemanticSignals(button).ancestry).toEqual([primaryButton]);
    });

    it("promotes a section with a heading to titled-section", () => {
      const button = buildChain("section", "button");
      const heading = document.createElement("h2");
      heading.textContent = "Billing";
      button.parentElement!.prepend(heading);

      expect(extractSemanticSignals(button).ancestry).toEqual([
        primaryButton,
        { tag: "section", role: null, containerType: "titled-section", hasTitle: true },
      ]);
    });

    it("demotes a section without a heading to generic and drops it", () => {
      const button = buildChain("section", "button");

      expect(extractSemanticSignals(button).ancestry).toEqual([primaryButton]);
    });

    it("keeps an article with a blank heading as titled-section but without a title", () => {
      const button = buildChain("article", "button");
      const heading = document.createElement("h3");
      heading.textContent = "   ";
      button.parentElement!.prepend(heading);

      expect(extractSemanticSignals(button).ancestry).toEqual([
        primaryButton,
        { tag: "article", role: null, containerType: "titled-section", hasTitle: false },
      ]);
    });

    it.each(["dialog", "alertdialog"])("role=%s makes any mapped container a dialog", (role) => {
      const button = buildChain("section", "button");
      button.parentElement!.setAttribute("role", role);

      expect(extractSemanticSignals(button).ancestry).toEqual([
        primaryButton,
        { tag: "section", role, containerType: "dialog", hasTitle: false },
      ]);
    });

    it("leaves a non-dialog role to be resolved by the container tag", () => {
      const button = buildChain("nav", "button");
      button.parentElement!.setAttribute("role", "navigation");

      expect(extractSemanticSignals(button).ancestry).toEqual([
        primaryButton,
        { tag: "nav", role: "navigation", containerType: "nav", hasTitle: false },
      ]);
    });

    it("records at most MAX_ANCESTRY_ENTRIES entries, nearest first", () => {
      const button = buildChain("form", "fieldset", "nav", "table", "button");

      const ancestry = extractSemanticSignals(button).ancestry;

      expect(ancestry.map((node) => node.tag)).toEqual(["button", "table", "nav"]);
    });

    it("stops walking after five ancestors, ignoring containers above them", () => {
      const button = buildChain("form", "nav", "div", "div", "div", "div", "button");

      expect(extractSemanticSignals(button).ancestry).toEqual([primaryButton]);
    });

    it("collects no ancestry for an element that is not a primary itself", () => {
      const span = buildChain("section", "span");
      const heading = document.createElement("h2");
      heading.textContent = "Billing";
      span.parentElement!.prepend(heading);

      expect(extractSemanticSignals(span)).toMatchObject({
        semanticRole: "unknown",
        ancestry: [],
      });
    });
  });

  describe("extractConstraintSignals() — width buckets", () => {
    it.each([
      [79, "tiny"],
      [80, "small"],
      [159, "small"],
      [160, "medium"],
      [319, "medium"],
      [320, "large"],
      [639, "large"],
      [640, "full"],
    ])("width %dpx → widthBucket %s", (width, expected) => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, { width, height: 20, top: 0, left: 0, right: width, bottom: 20 });

      expect(extractConstraintSignals(div, div.getBoundingClientRect()).hard.widthBucket).toBe(
        expected,
      );
    });

    it.each([
      [60, true, false],
      [100, false, true],
      [200, false, true],
      [400, false, false],
      [800, false, false],
    ])("width %dpx → mustBeShort %s, visuallyCompact %s", (width, mustBeShort, visuallyCompact) => {
      const div = document.createElement("div");
      document.body.appendChild(div);
      mockBoundingClientRect(div, {
        width,
        height: 20,
        top: 0,
        left: 0,
        right: width,
        bottom: 20,
      });

      const constraints = extractConstraintSignals(div, div.getBoundingClientRect());

      expect(constraints.hard.mustBeShort).toBe(mustBeShort);
      expect(constraints.soft.visuallyCompact).toBe(visuallyCompact);
    });
  });

  describe("extractConstraintSignals() — truncation and line breaking", () => {
    function wideElement(tag: string, styles: Partial<CSSStyleDeclaration>): Element {
      const element = document.createElement(tag);
      Object.assign(element.style, styles);
      document.body.appendChild(element);
      mockBoundingClientRect(element, {
        width: 200,
        height: 20,
        top: 0,
        left: 0,
        right: 200,
        bottom: 20,
      });
      return element;
    }

    it("clipping plus nowrap makes a wide element hard-truncated", () => {
      const element = wideElement("span", { overflow: "hidden", whiteSpace: "nowrap" });

      const constraints = extractConstraintSignals(element, element.getBoundingClientRect());

      expect(constraints.hard.mustBeShort).toBe(true);
      expect(constraints.hard.singleLine).toBe(true);
      expect(constraints.soft.likelyTruncated).toBe(false);
    });

    it("an ellipsis plus nowrap makes a wide element hard-truncated without overflow hidden", () => {
      const element = wideElement("span", { textOverflow: "ellipsis", whiteSpace: "nowrap" });

      expect(
        extractConstraintSignals(element, element.getBoundingClientRect()).hard.mustBeShort,
      ).toBe(true);
    });

    it("clipping without nowrap is only a soft truncation hint", () => {
      const element = wideElement("span", { overflow: "hidden" });

      const constraints = extractConstraintSignals(element, element.getBoundingClientRect());

      expect(constraints.hard.mustBeShort).toBe(false);
      expect(constraints.hard.singleLine).toBe(false);
      expect(constraints.soft.likelyTruncated).toBe(true);
    });

    it("an input is single line even when nothing sets nowrap", () => {
      const element = wideElement("input", {});

      expect(
        extractConstraintSignals(element, element.getBoundingClientRect()).hard.singleLine,
      ).toBe(true);
    });
  });

  describe("extractConstraintSignals() — visual prominence", () => {
    it.each([
      [24, "high"],
      [20, "high"],
      [19, "medium"],
      [14, "medium"],
      [13, "low"],
      [10, "low"],
    ])("font-size %dpx → visualProminence %s", (fontSize, expected) => {
      const span = document.createElement("span");
      span.style.fontSize = `${fontSize}px`;
      document.body.appendChild(span);
      mockBoundingClientRect(span, {
        width: 200,
        height: 20,
        top: 0,
        left: 0,
        right: 200,
        bottom: 20,
      });

      expect(
        extractConstraintSignals(span, span.getBoundingClientRect()).soft.visualProminence,
      ).toBe(expected);
    });
  });

  describe("buildNeighborCandidates() — text drop filter", () => {
    it.each([
      { text: "Email address", included: true },
      { text: "2 items", included: true },
      { text: "Row 3", included: true },
      { text: "$5.00", included: true },
      { text: "3rd", included: true },
      { text: "Call 555 123 4567", included: true },
      { text: "Click ok", included: true },
      { text: "OK to proceed", included: true },
      { text: "x".repeat(80), included: true },
      { text: "ok", included: false },
      { text: "  ok  ", included: false },
      { text: "+1 555 0100", included: false },
      { text: "555 0100 ext 12", included: false },
      { text: "order 12345678", included: false },
      { text: "x".repeat(81), included: false },
    ])("neighbour text $text → included: $included", ({ text, included }) => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      neighbor.textContent = text;
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates.map((c) => c.key)).toEqual(included ? ["neighbor.key"] : []);
    });

    it("keeps a label neighbour whose text is generic noise", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Next";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "label.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates.map((c) => c.key)).toEqual(["label.key"]);
    });

    it("drops a heading neighbour whose text is mostly numeric", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("h3");
      neighbor.textContent = "1 234,50";
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "amount.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toEqual([]);
    });
  });

  describe("buildNeighborCandidates() — geometry", () => {
    function neighborAt(dx: number, dy: number) {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      document.body.append(target, neighbor);

      return {
        targetMeta: withMeta(target, "ns", "target.key", boxAt(200, 200)),
        neighborMeta: withMeta(neighbor, "ns", "neighbor.key", boxAt(200 + dx, 200 + dy)),
      };
    }

    it.each([
      { dx: 100, dy: 0, expected: "right" },
      { dx: -100, dy: 0, expected: "left" },
      { dx: 0, dy: 100, expected: "below" },
      { dx: 0, dy: -100, expected: "above" },
      { dx: 100, dy: 30, expected: "below" },
      { dx: 20, dy: 20, expected: "below" },
      { dx: 20, dy: -20, expected: "above" },
      { dx: 0, dy: 0, expected: "above" },
    ])("neighbour offset ($dx, $dy) → relativePosition $expected", ({ dx, dy, expected }) => {
      const { targetMeta, neighborMeta } = neighborAt(dx, dy);

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates[0]).toMatchObject({ relativePosition: expected });
    });

    it("keeps a neighbour exactly at MAX_NEIGHBOR_DISTANCE", () => {
      const { targetMeta, neighborMeta } = neighborAt(MAX_NEIGHBOR_DISTANCE, 0);

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ key: "neighbor.key", distance: MAX_NEIGHBOR_DISTANCE }]);
    });

    it("orders candidates by distance, nearest first", () => {
      const target = document.createElement("button");
      const far = document.createElement("span");
      const near = document.createElement("span");
      const middle = document.createElement("span");
      document.body.append(target, far, near, middle);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const all = [
        withMeta(far, "ns", "far.key", boxAt(0, 300)),
        withMeta(near, "ns", "near.key", boxAt(0, 100)),
        withMeta(middle, "ns", "middle.key", boxAt(0, 200)),
      ];

      const candidates = buildNeighborCandidates(targetMeta, all);

      expect(candidates.map((c) => c.key)).toEqual(["near.key", "middle.key", "far.key"]);
    });

    it("caps the payload at MAX_NEIGHBORS_PER_OBSERVATION nearest neighbours", () => {
      const target = document.createElement("button");
      document.body.appendChild(target);
      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const all = Array.from({ length: 13 }, (_, i) => {
        const neighbor = document.createElement("span");
        document.body.appendChild(neighbor);
        return withMeta(neighbor, "ns", `n${i + 1}.key`, boxAt(0, (i + 1) * 20));
      });

      const candidates = buildNeighborCandidates(targetMeta, all);

      expect(candidates.map((c) => c.key)).toEqual([
        "n1.key",
        "n2.key",
        "n3.key",
        "n4.key",
        "n5.key",
        "n6.key",
        "n7.key",
        "n8.key",
        "n9.key",
        "n10.key",
        "n11.key",
        "n12.key",
      ]);
    });

    it("keeps a neighbour that reuses the target key under another namespace", () => {
      const target = document.createElement("button");
      const neighbor = document.createElement("span");
      document.body.append(target, neighbor);

      const targetMeta = withMeta(target, "checkout", "title", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "legal", "title", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ namespace: "legal", key: "title" }]);
    });

    it("separates namespace from key so that neighbours cannot collide across namespaces", () => {
      const target = document.createElement("button");
      const first = document.createElement("span");
      const second = document.createElement("span");
      document.body.append(target, first, second);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const all = [
        withMeta(first, "home", "nav.title", boxAt(0, 40)),
        withMeta(second, "homenav", ".title", boxAt(0, 80)),
      ];

      const candidates = buildNeighborCandidates(targetMeta, all);

      expect(candidates.map((c) => `${c.namespace}/${c.key}`)).toEqual([
        "home/nav.title",
        "homenav/.title",
      ]);
    });
  });

  describe("buildNeighborCandidates() — container signals", () => {
    // <fieldset>, not <form>: happy-dom's HTMLFormElement.contains() always
    // returns false, which would fake a passing sameContainerAs === null.
    it("reports the nearest container of the neighbour and the container it shares with the target", () => {
      const fieldset = document.createElement("fieldset");
      const row = document.createElement("div");
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      row.append(target, neighbor);
      fieldset.appendChild(row);
      document.body.appendChild(fieldset);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([
        { containerType: "fieldset", sameContainerAs: "fieldset" },
      ]);
    });

    it("reports no shared container when the neighbour sits outside the target container", () => {
      const fieldset = document.createElement("fieldset");
      const row = document.createElement("div");
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      row.appendChild(target);
      fieldset.appendChild(row);
      document.body.append(fieldset, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ containerType: "generic", sameContainerAs: null }]);
    });

    it("ignores a container more than five levels above the neighbour", () => {
      const row = buildChain("fieldset", "div", "div", "div", "div", "div");
      const target = document.createElement("button");
      const neighbor = document.createElement("label");
      neighbor.textContent = "Email address";
      row.append(target, neighbor);

      const targetMeta = withMeta(target, "ns", "target.key", boxAt(0, 0));
      const neighborMeta = withMeta(neighbor, "ns", "neighbor.key", boxAt(0, 40));

      const candidates = buildNeighborCandidates(targetMeta, [targetMeta, neighborMeta]);

      expect(candidates).toMatchObject([{ containerType: "generic", sameContainerAs: null }]);
    });
  });
});
