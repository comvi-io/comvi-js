/**
 * The guard is only useful if loading the host runs it. This file imports the
 * host and NOTHING else, so the slot below can only have been claimed by
 * `core/i18n.ts` calling the guard.
 *
 * The import is static on purpose: evaluated when this file loads, not inside a
 * test, so core's module-level initializers keep the coverage shape the rest of
 * the suite gives them.
 */
import { describe, it, expect } from "vitest";
import "../../src/core/i18n";
import pkg from "../../package.json";

const VERSION_KEY = Symbol.for("comvi.core.version");
const slotAfterHostLoad = (globalThis as unknown as Record<symbol, unknown>)[VERSION_KEY];

describe("duplicate @comvi/core detection", () => {
  it("is armed by loading the host module", () => {
    expect(slotAfterHostLoad).toBe(pkg.version);
  });
});
