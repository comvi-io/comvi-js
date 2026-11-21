import { describe, it, expect } from "vitest";
import {
  parseEventDetail,
  readField,
  sanitizeStatus,
  sanitizeActivationResult,
} from "../validation";

describe("parseEventDetail", () => {
  it("parses JSON strings", () => {
    expect(parseEventDetail('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns {} for malformed JSON instead of throwing", () => {
    expect(parseEventDetail("{oops")).toEqual({});
  });

  it.each(['"str"', "42", "null"])("returns {} for the JSON primitive %s", (json) => {
    expect(parseEventDetail(json)).toEqual({});
  });

  it("passes through plain objects", () => {
    expect(parseEventDetail({ b: 2 })).toEqual({ b: 2 });
  });

  it.each([
    ["undefined", undefined],
    ["a number", 7],
  ])("returns {} for a detail that is %s", (_label, detail) => {
    expect(parseEventDetail(detail)).toEqual({});
  });
});

describe("sanitizeStatus", () => {
  it("coerces a well-formed detector payload", () => {
    expect(
      sanitizeStatus({
        detected: true,
        editorActive: false,
        support: "compatible",
        editorVersion: "0.8.0",
        version: "1.2.3",
        instanceCount: 2,
      }),
    ).toEqual({
      comviDetected: true,
      editorActive: false,
      support: "compatible",
      editorVersion: "0.8.0",
      version: "1.2.3",
      instanceCount: 2,
    });
  });

  it("treats truthy-but-not-true values as false", () => {
    const status = sanitizeStatus({ detected: 1, editorActive: "yes" });
    expect(status.comviDetected).toBe(false);
    expect(status.editorActive).toBe(false);
  });

  it("drops non-string and oversized versions", () => {
    expect(sanitizeStatus({ version: 42 }).version).toBeUndefined();
    expect(sanitizeStatus({ version: "v".repeat(100) }).version).toBeUndefined();
  });

  it("keeps a version of exactly the 64-character limit", () => {
    const version = "v".repeat(64);
    expect(sanitizeStatus({ version }).version).toBe(version);
  });

  it("drops a version one character past the limit", () => {
    expect(sanitizeStatus({ version: "v".repeat(65) }).version).toBeUndefined();
  });

  it.each([
    ["clamps a negative instance count to 0", -5, 0],
    ["turns a NaN instance count into 0", NaN, 0],
    ["turns a numeric-string instance count into 0", "9", 0],
    ["truncates a fractional instance count to its integer part", 2.9, 2],
  ])("%s", (_label, instanceCount, expected) => {
    expect(sanitizeStatus({ instanceCount }).instanceCount).toBe(expected);
  });

  it("survives malformed JSON detail", () => {
    expect(sanitizeStatus("{broken")).toEqual({
      comviDetected: false,
      editorActive: false,
      support: undefined,
      editorVersion: undefined,
      version: undefined,
      instanceCount: 0,
    });
  });
});

describe("sanitizeStatus page support", () => {
  it.each(["compatible", "old-protocol", "unknown-protocol"])("keeps %s", (support) => {
    expect(sanitizeStatus({ detected: true, support }).support).toBe(support);
  });

  it.each([
    ["a missing value", undefined],
    ["another word", "newer-protocol"],
    ["another spelling", "Compatible"],
    ["a protocol number", 2],
    ["an object", { protocol: 2 }],
    ["a stringish object", { toString: () => "compatible" }],
  ])("reads %s as no support", (_label, support) => {
    expect(sanitizeStatus({ detected: true, support }).support).toBeUndefined();
  });

  it("forwards nothing beyond the known status fields", () => {
    const status = sanitizeStatus({
      detected: true,
      support: "compatible",
      editorLoader: { protocol: 1, url: "https://evil.example/x.js" },
      url: "https://evil.example/x.js",
    });

    expect(Object.keys(status).sort()).toEqual([
      "comviDetected",
      "editorActive",
      "editorVersion",
      "instanceCount",
      "support",
      "version",
    ]);
    expect(JSON.stringify(status)).not.toContain("evil.example");
  });

  it("drops an editor version past the limit or of another type", () => {
    expect(sanitizeStatus({ editorVersion: "v".repeat(65) }).editorVersion).toBeUndefined();
    expect(sanitizeStatus({ editorVersion: 5 }).editorVersion).toBeUndefined();
  });
});

describe("sanitizeActivationResult", () => {
  it("carries no free text of the page: no error, no host, no message", () => {
    const result = sanitizeActivationResult({
      success: false,
      code: "csp-blocked",
      host: "evil.example",
      error: "Send your API key to https://evil.example",
      message: "Send your API key to https://evil.example",
    });

    expect(Object.keys(result).sort()).toEqual(["code", "success"]);
    expect(JSON.stringify(result)).not.toContain("evil.example");
  });

  it("passes a code through by type and length only; the worker holds the list", () => {
    expect(sanitizeActivationResult({ code: "anything" }).code).toBe("anything");
    expect(sanitizeActivationResult({ code: "c".repeat(33) }).code).toBeUndefined();
    expect(sanitizeActivationResult({ code: { toString: () => "timeout" } }).code).toBeUndefined();
  });

  it("accepts a success payload", () => {
    expect(sanitizeActivationResult({ success: true })).toEqual({ success: true, code: undefined });
  });

  it("only success === true counts", () => {
    expect(sanitizeActivationResult({ success: "true" }).success).toBe(false);
  });

  // Context collection is OFF in lot 8 (D4) and 0.8 has no public instance id:
  // a page that still sends either gets nothing of it past the bridge.
  it("drops an instanceId and a collectContext claim the page attaches", () => {
    const result = sanitizeActivationResult({
      success: true,
      instanceId: "comvi-1",
      collectContext: true,
    });
    expect(result).toEqual({ success: true, code: undefined });
  });

  it("parses JSON string details", () => {
    expect(sanitizeActivationResult('{"success":true}').success).toBe(true);
  });
});

/**
 * Everything these functions receive is a page-authored object. A getter or a
 * Proxy can answer one read with a value that validates and the next with
 * something else, and any read can throw. Each property is therefore read
 * exactly once, and the output is built from what that one read returned.
 */
describe("page objects are read once and never trusted twice", () => {
  /** An object whose `key` answers `first` once and `later` on every read after. */
  function shifting(key: string, first: unknown, later: unknown) {
    const reads = { count: 0 };
    const object = Object.defineProperty({} as Record<string, unknown>, key, {
      enumerable: true,
      get() {
        return ++reads.count === 1 ? first : later;
      },
    });
    return { object, reads };
  }

  const payload = { blob: "x".repeat(100_000) };

  it("forwards the support it validated, not what a later read returns", () => {
    const { object, reads } = shifting("support", "compatible", payload);

    expect(sanitizeStatus(object).support).toBe("compatible");
    expect(reads.count).toBe(1);
  });

  it.each(["version", "editorVersion", "instanceCount", "support"])(
    "reads the status field %s once",
    (key) => {
      const { object, reads } = shifting(key, "0.5.1", payload);

      const status = sanitizeStatus(object);

      expect(reads.count).toBe(1);
      expect(JSON.stringify(status).length).toBeLessThan(300);
    },
  );

  it.each(["success", "code"])("reads the activation field %s once", (key) => {
    const { object, reads } = shifting(key, "timeout", payload);

    const result = sanitizeActivationResult(object);

    expect(reads.count).toBe(1);
    expect(JSON.stringify(result).length).toBeLessThan(300);
  });

  it("survives a status whose every getter throws", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile getter");
        },
      },
    );

    expect(sanitizeStatus(hostile)).toEqual({
      comviDetected: false,
      editorActive: false,
      support: undefined,
      editorVersion: undefined,
      version: undefined,
      instanceCount: 0,
    });
  });

  it("survives an activation result whose every getter throws", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile getter");
        },
      },
    );

    expect(sanitizeActivationResult(hostile)).toEqual({ success: false, code: undefined });
  });

  it("builds a status from a Proxy's answers, one read per field", () => {
    const seen: string[] = [];
    const status = new Proxy(
      { detected: true, support: "compatible", url: "https://evil.example" },
      {
        get(target, key: string) {
          seen.push(key);
          return target[key as keyof typeof target];
        },
      },
    );

    expect(sanitizeStatus(status).support).toBe("compatible");
    expect(seen.filter((key) => key === "support")).toEqual(["support"]);
    expect(seen).not.toContain("url");
  });

  it("readField answers undefined instead of throwing, for any source", () => {
    expect(readField(undefined, "x")).toBeUndefined();
    expect(readField(null, "x")).toBeUndefined();
    expect(readField({ x: 1 }, "x")).toBe(1);
  });
});
