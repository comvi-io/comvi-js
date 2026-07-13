import { describe, expect, it } from "vitest";
import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("combines conditional classes and resolves Tailwind conflicts", () => {
    const hidden = false;

    expect(cn("px-2", hidden && "hidden", ["text-sm", "px-4"])).toBe("text-sm px-4");
  });
});
