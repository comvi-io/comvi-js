import { describe, expect, it } from "vitest";
import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("combines conditional classes and resolves Tailwind conflicts", () => {
    const hidden = false;

    expect(cn("px-2", hidden && "hidden", ["text-sm", "px-4"])).toBe("text-sm px-4");
  });

  it("returns an empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("drops null and undefined entries", () => {
    expect(cn("px-2", null, undefined, "text-sm")).toBe("px-2 text-sm");
  });
});
