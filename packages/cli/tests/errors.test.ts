import { describe, expect, it } from "vitest";
import { ErrorCodes, isTypegenError, TypegenError, wrapError } from "../src/utils/errors";

describe("TypegenError", () => {
  it("carries its name, code, message and cause", () => {
    const cause = new Error("root cause");

    const error = new TypegenError("broken", ErrorCodes.CONFIG_INVALID, cause);

    expect(error.name).toBe("TypegenError");
    expect(error.code).toBe(ErrorCodes.CONFIG_INVALID);
    expect(error.message).toBe("broken");
    expect(error.cause).toBe(cause);
  });

  it("captures a stack trace headed by its name and message", () => {
    const error = new TypegenError("broken", ErrorCodes.CONFIG_INVALID);

    expect(error.stack).toContain("TypegenError: broken");
  });
});

describe("wrapError", () => {
  it("returns the same TypegenError instance untouched", () => {
    const original = new TypegenError("original", ErrorCodes.VALIDATION_FAILED);

    const wrapped = wrapError(original, "outer context", ErrorCodes.FS_WRITE_FAILED);

    expect(wrapped).toBe(original);
    expect(wrapped.code).toBe(ErrorCodes.VALIDATION_FAILED);
    expect(wrapped.message).toBe("original");
  });
});

describe("isTypegenError", () => {
  it("rejects errors that are not TypegenError", () => {
    expect(isTypegenError(new Error("plain"))).toBe(false);
  });

  it("matches any TypegenError when no code is given", () => {
    expect(isTypegenError(new TypegenError("m", ErrorCodes.API_TIMEOUT))).toBe(true);
  });

  it("matches only the requested code", () => {
    const error = new TypegenError("m", ErrorCodes.API_TIMEOUT);

    expect(isTypegenError(error, ErrorCodes.API_TIMEOUT)).toBe(true);
    expect(isTypegenError(error, ErrorCodes.API_AUTH_FAILED)).toBe(false);
  });
});
