import { describe, expect, it, vi } from "vitest";
import { isServer } from "../src/runtime/utils/runtime";

describe("isServer", () => {
  it("reports a strict false when Nuxt has not marked the runtime as the server", () => {
    expect(isServer()).toBe(false);
  });

  it("reports a strict true when Nuxt marks the runtime as the server", () => {
    vi.stubGlobal("__COMVI_TEST_SERVER__", true);

    expect(isServer()).toBe(true);
  });
});
