import { describe, it, expect, afterEach } from "vitest";
import { extractSemanticSignals } from "../src/collector/signals";
import { cleanupDOM } from "./helpers";
import { buildChain } from "./helpers/collectorSignals";

describe("collector/signals — extractSemanticSignals", () => {
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
});
