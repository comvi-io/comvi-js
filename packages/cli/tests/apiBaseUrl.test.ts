import { describe, it, expect } from "vitest";
import { isHttpUrl } from "../src/core/apiBaseUrl";

describe("isHttpUrl", () => {
  it.each(["https://api.comvi.io", "http://localhost:3000/", "HTTPS://API.TEST.COM/v1"])(
    "accepts %s",
    (value) => {
      expect(isHttpUrl(value)).toBe(true);
    },
  );

  it.each([
    "",
    "api.comvi.io",
    "not a url",
    "ftp://api.comvi.io",
    "file:///etc/passwd",
    "javascript:1",
  ])("rejects %j", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });
});
