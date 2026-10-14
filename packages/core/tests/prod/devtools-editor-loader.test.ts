/**
 * The editor loader's two development warnings are folded out of production:
 * an invalid `editorVersion` still fails closed (no URL, `load()` requests
 * nothing and answers `invalid-editor-version`), and a second instance with a
 * different pin still yields to the first — both silently.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createI18n } from "../../src";
import { devtools } from "../../src/devtools";
import type { EditorLoaderSlot } from "../../src/devtools";

const LOADER_KEY = Symbol.for("comvi.devtools.editorLoader");
const LATEST_URL =
  "https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js";

const slots = globalThis as unknown as Record<symbol, unknown>;

function install(editorVersion?: string): EditorLoaderSlot {
  createI18n({ locale: "en" }).use(devtools({ editorVersion }));
  return slots[LOADER_KEY] as EditorLoaderSlot;
}

beforeEach(() => {
  delete slots[LOADER_KEY];
});

afterEach(() => {
  delete slots[LOADER_KEY];
});

describe("editor loader in a production build", () => {
  it.each(["../evil", "0.5.3?x", ""])(
    "invalid version %j → fails closed, silently",
    async (version) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const slot = install(version);
      const result = await slot.load();

      expect(slot).toMatchObject({ editorVersion: "invalid", url: "" });
      expect(result).toMatchObject({ ok: false, code: "invalid-editor-version" });
      expect(document.querySelectorAll("script")).toHaveLength(0);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("no editorVersion → latest, silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(install()).toMatchObject({ editorVersion: "latest", url: LATEST_URL });
    expect(warn).not.toHaveBeenCalled();
  });

  it("reused slot with a different pin → the existing pin wins, silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = install("0.5.3");

    const second = install("0.5.4");

    expect(second).toBe(first);
    expect(second.editorVersion).toBe("0.5.3");
    expect(warn).not.toHaveBeenCalled();
  });
});
