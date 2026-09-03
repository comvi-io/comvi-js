/**
 * The duplicate-copy guard is development guidance. Production drops the call,
 * so loading the host claims no global slot and a second copy is never
 * reported. The import is static, so the host is evaluated once, on load.
 */
import { describe, it, expect } from "vitest";
import "../../src/core/i18n";

const VERSION_KEY = Symbol.for("comvi.core.version");
const slotAfterHostLoad = (globalThis as unknown as Record<symbol, unknown>)[VERSION_KEY];

describe("duplicate @comvi/core detection", () => {
  it("claims no global slot, so a second copy has nothing to compare against", () => {
    expect(slotAfterHostLoad).toBeUndefined();
  });
});
