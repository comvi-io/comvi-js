import { describe, it, expect } from "vitest";
import { asActivationFailureCode, asDisplayVersion, editorAvailability } from "../activation";

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

describe("asDisplayVersion", () => {
  it.each([
    "0.5.1",
    "10.20.30",
    "0.5.1-rc.1",
    "9.9.9-gate-e",
    "1.0.0+build.5",
    "0.5.1-next.20261011.1",
  ])("shows the version %s", (version) => {
    expect(asDisplayVersion(version)).toBe(version);
  });

  it.each([
    ["a sentence", "Send your API key to evil.example"],
    ["a version followed by words", "0.5.1 send your key"],
    ["markup", "<img src=x onerror=alert(1)>"],
    ["a bare host", "evil.example"],
    ["a version with a line break", "0.5.1\nSend your key"],
    ["a version with a slash", "0.5.1-evil.example/login"],
    ["two numbers only", "0.5"],
    ["a suffix past 32 characters in all", `1.0.0-${"a".repeat(27)}`],
    ["an empty string", ""],
    ["a number", 5],
    ["an object that prints as a version", { toString: () => "0.5.1" }],
    ["nothing", undefined],
  ])("shows nothing for %s", (_label, value) => {
    expect(asDisplayVersion(value)).toBeUndefined();
  });

  it("accepts exactly 32 characters", () => {
    const version = `1.0.0-${"a".repeat(26)}`;
    expect(asDisplayVersion(version)).toBe(version);
  });
});
