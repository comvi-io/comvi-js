import { describe, it, expect, afterEach } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import {
  normalizeRoute,
  routeDigest,
  findModalContext,
  computeScreenGroup,
} from "../src/collector/screenGroup";
import { sha256Hex } from "../src/collector/hash/observation-hash";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";

const VISIBLE_RECT = { top: 0, left: 0, width: 200, height: 100, right: 200, bottom: 100 };

function makeRegistry(): TranslationRegistry {
  return new TranslationRegistry(new EventBus());
}

function mountDialog(attrs: Record<string, string> = {}): HTMLElement {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  for (const [name, value] of Object.entries(attrs)) {
    if (name === "id") dialog.id = value;
    else dialog.setAttribute(name, value);
  }
  document.body.appendChild(dialog);
  mockBoundingClientRect(dialog, VISIBLE_RECT);
  return dialog;
}

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

  describe("routeDigest — the default, opaque group", () => {
    it("never carries raw path segments (PII barrier is the digest, not the heuristics)", () => {
      const digest = routeDigest("/users/johndoe/profile");
      expect(digest).toMatch(/^route:[0-9a-f]{16}$/);
      expect(digest).not.toContain("johndoe");
      expect(digest).not.toContain("profile");
    });

    it("is stable across entity ids on the same logical screen", () => {
      expect(routeDigest("/projects/123/keys")).toBe(routeDigest("/projects/456/keys"));
    });

    it("differs between logical screens", () => {
      expect(routeDigest("/settings/billing")).not.toBe(routeDigest("/dashboard"));
    });
  });

  describe("findModalContext", () => {
    it("returns null when no dialog is open", () => {
      expect(findModalContext(document, makeRegistry())).toBeNull();
    });

    it("digests a stable id — the raw attribute value never appears (dynamic ids can embed user data)", () => {
      const dialog = mountDialog({ id: "confirm-delete-user@x.co" });
      const context = findModalContext(document, makeRegistry());

      expect(context?.element).toBe(dialog);
      expect(context?.discriminator).toBe(
        "modal:" + sha256Hex("confirm-delete-user@x.co").slice(0, 12),
      );
      expect(context?.discriminator).not.toContain("user@x.co");
    });

    it("recognizes a native open <dialog>", () => {
      const dialog = document.createElement("dialog");
      dialog.setAttribute("open", "");
      dialog.id = "native-dialog";
      document.body.appendChild(dialog);
      mockBoundingClientRect(dialog, VISIBLE_RECT);

      expect(findModalContext(document, makeRegistry())?.element).toBe(dialog);
    });

    it("falls back to a registered {namespace,key} ref, never rendered text", () => {
      const registry = makeRegistry();

      const dialog = document.createElement("div");
      dialog.setAttribute("aria-modal", "true");
      document.body.appendChild(dialog);
      mockBoundingClientRect(dialog, VISIBLE_RECT);

      const title = document.createElement("h2");
      title.textContent = "Confirm deletion — this is sensitive user text";
      dialog.appendChild(title);
      registry.add(title, {
        nodes: new Map([[document.createTextNode("t"), { key: "dialog.title", ns: "modals" }]]),
      });

      const context = findModalContext(document, registry);
      expect(context?.discriminator).toBe("modal:modals:dialog.title");
      expect(context?.discriminator).not.toContain("Confirm deletion");
    });

    it("ignores dialogs with a zero-size rect (closed/hidden via layout)", () => {
      const dialog = mountDialog();
      mockBoundingClientRect(dialog, { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 });

      expect(findModalContext(document, makeRegistry())).toBeNull();
    });
  });

  describe("computeScreenGroup", () => {
    it("defaults to the opaque route digest and reports the open modal separately", () => {
      const dialog = mountDialog({ id: "settings-modal" });

      const { screenGroup, modal } = computeScreenGroup(
        document,
        makeRegistry(),
        "/projects/42/settings",
      );

      expect(screenGroup).toBe(routeDigest("/projects/42/settings"));
      expect(modal?.element).toBe(dialog);
      expect(modal?.discriminator).toBe("modal:" + sha256Hex("settings-modal").slice(0, 12));
    });

    it("has a null modal when no dialog is open", () => {
      const { screenGroup, modal } = computeScreenGroup(document, makeRegistry(), "/dashboard");
      expect(screenGroup).toBe(routeDigest("/dashboard"));
      expect(modal).toBeNull();
    });

    it("prefers the host-supplied resolver over the digest", () => {
      const { screenGroup } = computeScreenGroup(
        document,
        makeRegistry(),
        "/users/johndoe/profile",
        () => "/users/:id/profile",
      );
      expect(screenGroup).toBe("/users/:id/profile");
    });

    it("falls back to the digest when the resolver returns null or throws", () => {
      const registry = makeRegistry();
      expect(computeScreenGroup(document, registry, "/dashboard", () => null).screenGroup).toBe(
        routeDigest("/dashboard"),
      );
      expect(
        computeScreenGroup(document, registry, "/dashboard", () => {
          throw new Error("host resolver bug");
        }).screenGroup,
      ).toBe(routeDigest("/dashboard"));
    });

    it("caps an oversized resolver value", () => {
      const { screenGroup } = computeScreenGroup(document, makeRegistry(), "/x", () =>
        "/a".repeat(400),
      );
      expect(screenGroup.length).toBeLessThanOrEqual(120);
    });
  });
});
