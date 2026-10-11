import { describe, it, expect } from "vitest";
import { asActivationFailureCode, editorAvailability } from "../activation";

describe("editorAvailability", () => {
  it("is true for a page with a loader hook", () => {
    expect(editorAvailability({ editorLoaded: false, editorLoader: { protocol: 1 } })).toBe(true);
  });

  it("is true for a page that already carries the editor, hook or not", () => {
    expect(editorAvailability({ editorLoaded: true, editorLoader: null })).toBe(true);
  });

  it("is false once the detector looked and found neither", () => {
    expect(editorAvailability({ editorLoaded: false, editorLoader: null })).toBe(false);
  });

  it("is unknown for a status that does not mention the loader", () => {
    expect(editorAvailability({ editorLoaded: false })).toBeUndefined();
    expect(editorAvailability({})).toBeUndefined();
  });
});

describe("asActivationFailureCode", () => {
  it.each(["csp-blocked", "load-error", "timeout", "no-global", "no-loader"])(
    "keeps the known code %s",
    (code) => {
      expect(asActivationFailureCode(code)).toBe(code);
    },
  );

  it.each([
    ["an unknown code", "run-this"],
    ["a number", 3],
    ["an object", {}],
    ["nothing", undefined],
  ])("drops %s", (_label, value) => {
    expect(asActivationFailureCode(value)).toBeUndefined();
  });
});
