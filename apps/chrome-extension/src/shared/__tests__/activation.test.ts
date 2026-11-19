import { describe, it, expect } from "vitest";
import { asActivationFailureCode, asDisplayVersion, asPageSupport } from "../activation";

describe("asPageSupport", () => {
  it.each(["compatible", "old-protocol", "unknown-protocol"])("keeps %s", (support) => {
    expect(asPageSupport(support)).toBe(support);
  });

  it.each([
    ["another word", "newer"],
    ["a protocol number", 2],
    ["an object that prints as one", { toString: () => "compatible" }],
    ["nothing", undefined],
  ])("drops %s", (_label, value) => {
    expect(asPageSupport(value)).toBeUndefined();
  });
});

describe("asActivationFailureCode", () => {
  it.each([
    "csp-blocked",
    "trusted-types",
    "load-error",
    "timeout",
    "no-global",
    "bad-version",
    "old-protocol",
    "unknown-protocol",
    "no-instance",
  ])("keeps the known code %s", (code) => {
    expect(asActivationFailureCode(code)).toBe(code);
  });

  it.each([
    ["an unknown code", "run-this"],
    // 0.7 codes: the loader slot and the app's editor pin are gone in 0.8.
    ["the 0.7 no-loader code", "no-loader"],
    ["the 0.7 invalid-editor-version code", "invalid-editor-version"],
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
    "0.6.0-next.20261011",
    "1.0.0-beta",
    "0.5.1-canary.3",
    "9999.9999.9999-abcdefgh.12345678",
  ])("shows the version %s", (version) => {
    expect(asDisplayVersion(version)).toBe(version);
  });

  it.each([
    ["a host name as a pre-release", "1.0.0-evil.example"],
    ["build metadata", "0.5.1+call.0800.555"],
    ["a second dotted word", "1.0.0-rc.1.evil"],
    ["plain build metadata", "1.0.0+build.5"],
    ["an uppercase pre-release", "0.5.1-RC.1"],
    ["a pre-release with a hyphen", "9.9.9-gate-e"],
    ["two pre-release numbers", "0.5.1-next.20261011.1"],
    ["a pre-release word past 8 letters", "1.0.0-abcdefghi"],
    ["a pre-release number past 10 digits", "1.0.0-rc.12345678901"],
    ["a five-digit part", "10000.0.0"],
    ["a sentence", "Send your API key to evil.example"],
    ["a version followed by words", "0.5.1 send your key"],
    ["markup", "<img src=x onerror=alert(1)>"],
    ["a bare host", "evil.example"],
    ["a version with a line break", "0.5.1\nSend your key"],
    ["a version with a trailing line break", "0.5.1\n"],
    ["a version with a slash", "0.5.1-evil/login"],
    ["two numbers only", "0.5"],
    ["an empty string", ""],
    ["a number", 5],
    ["an object that prints as a version", { toString: () => "0.5.1" }],
    ["nothing", undefined],
  ])("shows nothing for %s", (_label, value) => {
    expect(asDisplayVersion(value)).toBeUndefined();
  });

  it("never shows more than 32 characters, even where the pattern would admit them", () => {
    expect("9999.9999.9999-abcdefgh.12345678").toHaveLength(32);
    expect(asDisplayVersion("9999.9999.9999-abcdefgh.123456789")).toBeUndefined();
  });
});
