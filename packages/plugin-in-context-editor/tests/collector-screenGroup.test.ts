import { describe, it, expect, afterEach, vi } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import {
  normalizeRoute,
  routeDigest,
  readCurrentRoute,
  findModalContext,
  computeScreenGroup,
} from "../src/collector/screenGroup";
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

    it.each([
      ["a 16-character hex segment", "/s/abcdef0123456789", "/s/:param"],
      ["hex followed by non-hex", "/s/abcdef0123456789zz", "/s/abcdef0123456789zz"],
      ["non-hex followed by hex", "/s/zzabcdef0123456789ab", "/s/zzabcdef0123456789ab"],
      ["a single hex character", "/x/a", "/x/a"],
      ["digits only at the end", "/p/abc123", "/p/abc123"],
      ["digits only at the start", "/p/123abc", "/p/123abc"],
      ["an all-digit segment", "/p/12", "/p/:param"],
      ["exactly 20 characters", "/x/abcdefghijklmnopqrst", "/x/abcdefghijklmnopqrst"],
      ["21 characters", "/x/abcdefghijklmnopqrstu", "/x/:param"],
    ])("anchors the dynamic-segment heuristics: %s", (_label, pathname, expected) => {
      expect(normalizeRoute(pathname)).toBe(expected);
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

  describe("readCurrentRoute", () => {
    afterEach(() => {
      window.history.replaceState({}, "", "/");
    });

    it("returns the pathname alone when there is no hash", () => {
      window.history.replaceState({}, "", "/app/settings");

      expect(readCurrentRoute()).toBe("/app/settings");
    });

    it("appends a hash-router path so hash-routed SPAs do not collapse into one screen", () => {
      window.history.replaceState({}, "", "/app#/users/1");

      expect(readCurrentRoute()).toBe("/app/users/1");
    });

    it("ignores a plain anchor hash that is not a hash-router path", () => {
      window.history.replaceState({}, "", "/app#section");

      expect(readCurrentRoute()).toBe("/app");
    });

    it("returns an empty route when there is no location (SSR)", () => {
      vi.stubGlobal("location", undefined);

      expect(readCurrentRoute()).toBe("");
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
      expect(context?.discriminator).toBe("modal:3ee0c93781c4");
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

    it.each([
      ["zero width but non-zero height", { width: 0, height: 100, right: 0, bottom: 100 }],
      ["zero height but non-zero width", { width: 200, height: 0, right: 200, bottom: 0 }],
    ])("still finds a dialog with %s — only a fully collapsed box is hidden", (_label, rect) => {
      const dialog = mountDialog({ id: "partially-collapsed" });
      mockBoundingClientRect(dialog, { top: 0, left: 0, ...rect });

      expect(findModalContext(document, makeRegistry())?.element).toBe(dialog);
    });

    it.each([
      ["display: none", "display", "none"],
      ["visibility: hidden", "visibility", "hidden"],
    ])("ignores a dialog hidden with %s even when it still measures a box", (_l, prop, value) => {
      const dialog = mountDialog({ id: "hidden-dialog" });
      dialog.style.setProperty(prop, value);

      expect(findModalContext(document, makeRegistry())).toBeNull();
    });

    it.each([
      ["data-testid", { "data-testid": "dlg-testid" }, "modal:151d9c14c92f"],
      ["aria-labelledby", { "aria-labelledby": "dlg-labelledby" }, "modal:bba074e3ff09"],
    ])("digests the %s attribute when the dialog has no id", (_label, attrs, expected) => {
      mountDialog(attrs);

      expect(findModalContext(document, makeRegistry())?.discriminator).toBe(expected);
    });

    it("takes the fallback ref from a translation INSIDE the dialog, never one outside it", () => {
      const registry = makeRegistry();

      const outside = document.createElement("span");
      document.body.appendChild(outside);
      registry.add(outside, {
        nodes: new Map([[document.createTextNode("o"), { key: "page.title", ns: "pages" }]]),
      });

      const dialog = mountDialog();
      const inside = document.createElement("h2");
      dialog.appendChild(inside);
      registry.add(inside, {
        nodes: new Map([[document.createTextNode("i"), { key: "dialog.title", ns: "modals" }]]),
      });

      expect(findModalContext(document, registry)?.discriminator).toBe("modal:modals:dialog.title");
    });

    it("skips a registered element inside the dialog that carries no translation nodes", () => {
      const registry = makeRegistry();
      const dialog = mountDialog();

      const empty = document.createElement("div");
      dialog.appendChild(empty);
      registry.add(empty, { nodes: new Map() });

      const withNodes = document.createElement("h2");
      dialog.appendChild(withNodes);
      registry.add(withNodes, {
        nodes: new Map([[document.createTextNode("i"), { key: "dialog.title", ns: "modals" }]]),
      });

      expect(findModalContext(document, registry)?.discriminator).toBe("modal:modals:dialog.title");
    });

    it("falls back to modal:unknown with no stable attribute and no translation inside", () => {
      const dialog = mountDialog();

      expect(findModalContext(document, makeRegistry())).toEqual({
        element: dialog,
        discriminator: "modal:unknown",
      });
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

      expect(screenGroup).toBe("route:f1bc0b4b50001b60");
      expect(modal?.element).toBe(dialog);
      expect(modal?.discriminator).toBe("modal:a812ad7ac4b7");
    });

    it("has a null modal when no dialog is open", () => {
      const { screenGroup, modal } = computeScreenGroup(document, makeRegistry(), "/dashboard");

      expect(screenGroup).toBe("route:89347bb23a645278");
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

    it.each([
      ["returning null", () => null],
      [
        "throwing",
        () => {
          throw new Error("host resolver bug");
        },
      ],
    ])("falls back to the route digest when the resolver is %s", (_label, resolver) => {
      const { screenGroup } = computeScreenGroup(
        document,
        makeRegistry(),
        "/dashboard",
        resolver as () => string | null,
      );

      expect(screenGroup).toBe("route:89347bb23a645278");
    });

    it("falls back to the route digest when the resolver returns only whitespace", () => {
      const { screenGroup } = computeScreenGroup(
        document,
        makeRegistry(),
        "/dashboard",
        () => "   ",
      );

      expect(screenGroup).toBe("route:89347bb23a645278");
    });

    it("trims surrounding whitespace off the resolver value", () => {
      const { screenGroup } = computeScreenGroup(
        document,
        makeRegistry(),
        "/x",
        () => "  /users/:id  ",
      );

      expect(screenGroup).toBe("/users/:id");
    });

    it("caps an oversized resolver value at 120 characters", () => {
      const { screenGroup } = computeScreenGroup(document, makeRegistry(), "/x", () =>
        "/a".repeat(400),
      );

      expect(screenGroup).toBe("/a".repeat(60));
    });
  });
});
