import { describe, expect, it } from "vitest";
import { isServer } from "../src/runtime/utils/runtime";

describe("isServer", () => {
  it("reports a strict false when Nuxt has not marked the runtime as the server", () => {
    expect(isServer()).toBe(false);
  });
});
