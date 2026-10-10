import { describe, expect, it } from "vitest";
import { defineComviSetup } from "../src/runtime/setup";

describe("defineComviSetup", () => {
  it("returns the same setup function", () => {
    const original = () => undefined;
    const setup = defineComviSetup(original);

    expect(setup).toBe(original);
  });
});
