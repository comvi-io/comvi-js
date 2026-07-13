import { describe, it, expect } from "vitest";
import { parseEventDetail, sanitizeStatus, sanitizeActivationResult } from "../validation";

describe("parseEventDetail", () => {
  it("parses JSON strings", () => {
    expect(parseEventDetail('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns {} for malformed JSON instead of throwing", () => {
    expect(parseEventDetail("{oops")).toEqual({});
  });

  it("returns {} for JSON primitives", () => {
    expect(parseEventDetail('"str"')).toEqual({});
    expect(parseEventDetail("42")).toEqual({});
    expect(parseEventDetail("null")).toEqual({});
  });

  it("passes through plain objects", () => {
    expect(parseEventDetail({ b: 2 })).toEqual({ b: 2 });
  });

  it("returns {} for non-object details", () => {
    expect(parseEventDetail(undefined)).toEqual({});
    expect(parseEventDetail(7)).toEqual({});
  });
});

describe("sanitizeStatus", () => {
  it("coerces a well-formed detector payload", () => {
    expect(
      sanitizeStatus({
        detected: true,
        editorActive: false,
        editorLoaded: true,
        version: "1.2.3",
        instanceCount: 2,
      }),
    ).toEqual({
      comviDetected: true,
      editorActive: false,
      editorLoaded: true,
      version: "1.2.3",
      instanceCount: 2,
    });
  });

  it("treats truthy-but-not-true values as false", () => {
    const status = sanitizeStatus({ detected: 1, editorActive: "yes", editorLoaded: {} });
    expect(status.comviDetected).toBe(false);
    expect(status.editorActive).toBe(false);
    expect(status.editorLoaded).toBe(false);
  });

  it("drops non-string and oversized versions", () => {
    expect(sanitizeStatus({ version: 42 }).version).toBeUndefined();
    expect(sanitizeStatus({ version: "v".repeat(100) }).version).toBeUndefined();
  });

  it("normalizes weird instance counts to 0", () => {
    expect(sanitizeStatus({ instanceCount: -5 }).instanceCount).toBe(0);
    expect(sanitizeStatus({ instanceCount: NaN }).instanceCount).toBe(0);
    expect(sanitizeStatus({ instanceCount: "9" }).instanceCount).toBe(0);
    expect(sanitizeStatus({ instanceCount: 2.9 }).instanceCount).toBe(2);
  });

  it("survives malformed JSON detail", () => {
    expect(sanitizeStatus("{broken")).toEqual({
      comviDetected: false,
      editorActive: false,
      editorLoaded: false,
      version: undefined,
      instanceCount: 0,
    });
  });
});

describe("sanitizeActivationResult", () => {
  it("accepts a success payload", () => {
    expect(
      sanitizeActivationResult({ success: true, instanceId: "abc", collectContext: true }),
    ).toEqual({
      success: true,
      error: undefined,
      instanceId: "abc",
      collectContext: true,
    });
  });

  it("only success === true counts", () => {
    const result = sanitizeActivationResult({ success: "true", collectContext: "true" });
    expect(result.success).toBe(false);
    expect(result.collectContext).toBe(false);
  });

  it("drops oversized error strings", () => {
    expect(sanitizeActivationResult({ error: "e".repeat(1000) }).error).toBeUndefined();
  });

  it("parses JSON string details", () => {
    expect(sanitizeActivationResult('{"success":true}').success).toBe(true);
  });
});
