import { describe, it, expect, vi } from "vitest";
import { warn } from "../../src/logger";

describe("production build condition (__DEV__ false)", () => {
  it("silences warn() — the dev-only console channel is compiled out", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    warn("should never reach the console in production");

    expect(spy).not.toHaveBeenCalled();
  });
});
