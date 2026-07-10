import { describe, it, expect, afterEach } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import {
  normalizeRoute,
  findModalDiscriminator,
  computeScreenGroup,
} from "../src/collector/screenGroup";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";

describe("collector/screenGroup", () => {
  afterEach(() => {
    cleanupDOM();
  });

  describe("normalizeRoute", () => {
    it("collapses numeric segments", () => {
      expect(normalizeRoute("/projects/123/keys")).toBe("/projects/:param/keys");
    });

    it("collapses uuid segments", () => {
      expect(normalizeRoute("/users/550e8400-e29b-41d4-a716-446655440000/profile")).toBe(
        "/users/:param/profile",
      );
    });

    it("collapses long hex/opaque segments", () => {
      expect(normalizeRoute("/sessions/abcdef0123456789abcd")).toBe("/sessions/:param");
      expect(normalizeRoute("/x/this-is-a-very-long-opaque-slug-value")).toBe("/x/:param");
    });

    it("preserves static route shapes", () => {
      expect(normalizeRoute("/settings/billing")).toBe("/settings/billing");
    });

    it("returns / for an empty path", () => {
      expect(normalizeRoute("")).toBe("/");
    });

    it("masks an email-shaped segment (MED-2 PII guard)", () => {
      expect(normalizeRoute("/users/user@x.co/profile")).toBe("/users/:param/profile");
    });

    it("masks a short, human-readable segment containing '@' even without a full email shape", () => {
      expect(normalizeRoute("/mentions/@bob")).toBe("/mentions/:param");
    });
  });

  describe("findModalDiscriminator", () => {
    it("returns null when no dialog is open", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);
      expect(findModalDiscriminator(document, registry)).toBeNull();
    });

    it("prefers a stable id over a registry ref", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.id = "confirm-delete";
      document.body.appendChild(dialog);
      mockBoundingClientRect(dialog, {
        top: 0,
        left: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
      });

      expect(findModalDiscriminator(document, registry)).toBe("modal:confirm-delete");
    });

    it("falls back to a registered {namespace,key} ref, never rendered text", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const dialog = document.createElement("div");
      dialog.setAttribute("aria-modal", "true");
      document.body.appendChild(dialog);
      mockBoundingClientRect(dialog, {
        top: 0,
        left: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
      });

      const title = document.createElement("h2");
      title.textContent = "Confirm deletion — this is sensitive user text";
      dialog.appendChild(title);
      registry.add(title, {
        nodes: new Map([[document.createTextNode("t"), { key: "dialog.title", ns: "modals" }]]),
      });

      const discriminator = findModalDiscriminator(document, registry);
      expect(discriminator).toBe("modal:modals:dialog.title");
      expect(discriminator).not.toContain("Confirm deletion");
    });

    it("ignores dialogs with a zero-size rect (closed/hidden via layout)", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      document.body.appendChild(dialog);
      mockBoundingClientRect(dialog, { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 });

      expect(findModalDiscriminator(document, registry)).toBeNull();
    });
  });

  describe("computeScreenGroup", () => {
    it("combines the normalized route with the modal discriminator", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.id = "settings-modal";
      document.body.appendChild(dialog);
      mockBoundingClientRect(dialog, {
        top: 0,
        left: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
      });

      const { screenGroup } = computeScreenGroup(document, registry, "/projects/42/settings");

      expect(screenGroup).toBe("/projects/:param/settings#modal:settings-modal");
    });

    it("is just the normalized route when no modal is open", () => {
      const eventBus = new EventBus();
      const registry = new TranslationRegistry(eventBus);

      const { screenGroup } = computeScreenGroup(document, registry, "/dashboard");
      expect(screenGroup).toBe("/dashboard");
    });
  });
});
