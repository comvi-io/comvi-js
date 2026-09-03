/**
 * The duplicate-copy guard is development guidance: production carries neither
 * the `Symbol.for` marker nor the message, so a second copy is silent there.
 */
import { describe, it, expect, vi } from "vitest";

const INSTANCE_KEY = Symbol.for("comvi.core.instance");
const globalSlot = globalThis as unknown as Record<symbol, unknown>;

describe("duplicate @comvi/core detection", () => {
  it("says nothing about a second copy, and claims no global slot", async () => {
    delete globalSlot[INSTANCE_KEY];
    await import("../../src/core/i18n");
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn).not.toHaveBeenCalled();
    expect(globalSlot[INSTANCE_KEY]).toBeUndefined();
  });
});
