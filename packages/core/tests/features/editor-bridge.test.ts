/**
 * `@comvi/core/editor-bridge` — the typed contract between the in-context
 * editor plugin and the SSR framework adapters.
 *
 * Both sides address the SAME two host properties and run the SAME two
 * validators: the editor plugin writes the bridge and consumes the adapter's
 * SSR payload (`packages/plugin-in-context-editor/src/index.ts`), the Nuxt/Next
 * adapters read the bridge on the server and hand the mappings back before
 * hydration (`packages/nuxt/src/runtime/plugin.ts`). Everything crossing that
 * seam is untrusted — a serialized payload, a property on a host another
 * package installed — so both validators must reject a malformed value rather
 * than hand a half-valid one on.
 *
 * Both guards test `typeof … === "object"`, which arrays pass. The two array
 * cases below pin that as it stands today; tightening them would be a src
 * change (`needs-seam`), not a test change.
 */
import { describe, it, expect } from "vitest";
import {
  EDITOR_MAPPINGS_GLOBAL,
  EDITOR_INITIAL_MAPPINGS_GLOBAL,
  readEditorMappings,
  toRecordOfNumbers,
  type InContextEditorMappings,
} from "../../src/editor-bridge";

/** A well-formed bridge, as the editor plugin installs it. */
function makeBridge(): InContextEditorMappings {
  return {
    getKeyMappings: () => ({ "app.title": 7 }),
    loadKeyMappings: () => {},
  };
}

describe("editor-bridge property keys", () => {
  // Hand-copied string literals in @comvi/plugin-in-context-editor and the
  // Nuxt/Next adapters' tests: changing either value is a breaking change.
  it("pins the two host property names the editor and the SSR adapters share", () => {
    expect(EDITOR_MAPPINGS_GLOBAL).toBe("__comviInContextEditorMappings");
    expect(EDITOR_INITIAL_MAPPINGS_GLOBAL).toBe("__comviInContextEditorInitialMappings");
  });
});

describe("toRecordOfNumbers()", () => {
  it("copies a key → finite-number record into a fresh object", () => {
    const payload = { "app.title": 7, "app.sub": -2.5, "app.zero": 0 };

    const result = toRecordOfNumbers(payload);

    expect(result).toEqual({ "app.title": 7, "app.sub": -2.5, "app.zero": 0 });
    expect(result).not.toBe(payload);
  });

  it("accepts an empty record — no mappings is a valid payload", () => {
    expect(toRecordOfNumbers({})).toEqual({});
  });

  it("accepts an array of finite numbers as an index-keyed record", () => {
    expect(toRecordOfNumbers([7, 8])).toEqual({ "0": 7, "1": 8 });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a boolean", true],
    ["a string", "app.title"],
  ])("rejects %s — a payload that is not an object", (_label, value) => {
    expect(toRecordOfNumbers(value)).toBeUndefined();
  });

  it.each([
    ["a string id", { "app.title": "7" }],
    ["a null id", { "app.title": null }],
    ["NaN", { "app.title": NaN }],
    ["Infinity", { "app.title": Infinity }],
    ["one bad entry among good ones", { "app.title": 7, "app.sub": undefined }],
    ["an array holding a string", ["7"]],
  ])("rejects the WHOLE payload for %s", (_label, value) => {
    expect(toRecordOfNumbers(value)).toBeUndefined();
  });
});

describe("readEditorMappings()", () => {
  it("returns the bridge an object host carries", () => {
    const bridge = makeBridge();
    const host = { [EDITOR_MAPPINGS_GLOBAL]: bridge };

    expect(readEditorMappings(host)).toBe(bridge);
  });

  it("returns the bridge a FUNCTION host carries", () => {
    const bridge = makeBridge();
    const host = Object.assign(() => {}, { [EDITOR_MAPPINGS_GLOBAL]: bridge });

    expect(readEditorMappings(host)).toBe(bridge);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", "i18n"],
  ])("returns undefined for %s in place of a host", (_label, host) => {
    expect(readEditorMappings(host)).toBeUndefined();
  });

  it("returns undefined for a host that carries no bridge — the editor's not-installed-yet probe", () => {
    expect(readEditorMappings({})).toBeUndefined();
  });

  it("accepts an array bridge that carries both methods", () => {
    const bridge = Object.assign([], {
      getKeyMappings: () => ({}),
      loadKeyMappings: () => {},
    });

    expect(readEditorMappings({ [EDITOR_MAPPINGS_GLOBAL]: bridge })).toBe(bridge);
  });

  it.each([
    ["a string", "bridge"],
    ["a number", 1],
    ["null", null],
    ["only getKeyMappings", { getKeyMappings: () => ({}) }],
    ["only loadKeyMappings", { loadKeyMappings: () => {} }],
    ["a non-function getKeyMappings", { getKeyMappings: {}, loadKeyMappings: () => {} }],
    ["a non-function loadKeyMappings", { getKeyMappings: () => ({}), loadKeyMappings: 1 }],
    [
      "a callable carrying both methods",
      Object.assign(() => {}, { getKeyMappings: () => ({}), loadKeyMappings: () => {} }),
    ],
  ])("returns undefined when the bridge is %s", (_label, bridge) => {
    expect(readEditorMappings({ [EDITOR_MAPPINGS_GLOBAL]: bridge })).toBeUndefined();
  });
});
