/**
 * The duplicate-copy guard is development guidance: production carries neither
 * the version marker nor the message, so a second copy is silent there and the
 * global slot is never claimed.
 */
import { describe, it, expect, vi } from "vitest";

const VERSION_KEY = Symbol.for("comvi.core.version");
const globalSlot = globalThis as unknown as Record<symbol, unknown>;

describe("duplicate @comvi/core detection", () => {
  it("claims no global slot, so a second copy has nothing to compare against", async () => {
    delete globalSlot[VERSION_KEY];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(globalSlot[VERSION_KEY]).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
