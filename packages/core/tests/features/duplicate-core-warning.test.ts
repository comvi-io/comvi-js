/**
 * Two copies of `@comvi/core` in one app share nothing that lives at module
 * scope: ambient tag registration, the `window.__COMVI__` queue and the static
 * template cache all belong to one copy. The failure is silent and looks like a
 * feature that "sometimes does not work", so the host module says so once, in
 * development only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const INSTANCE_KEY = Symbol.for("comvi.core.instance");
const globalSlot = globalThis as unknown as Record<symbol, unknown>;

describe("duplicate @comvi/core detection", () => {
  beforeEach(() => {
    delete globalSlot[INSTANCE_KEY];
    vi.resetModules();
  });

  afterEach(() => {
    delete globalSlot[INSTANCE_KEY];
  });

  it("stays silent when one copy of the host module is loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a second copy of the host module is loaded", async () => {
    await import("../../src/core/i18n");
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("two copies of @comvi/core");
  });

  it("names the ambient tags, devtools and template-cache hazards", async () => {
    await import("../../src/core/i18n");
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn.mock.calls[0]?.[0]).toBe(
      "[i18n] Detected two copies of @comvi/core in one app. Ambient tags (@comvi/core/tags), the window.__COMVI__ devtools handshake and the template cache belong to one copy each and will not be shared. Align the @comvi/core version your framework binding depends on with the one you installed directly.",
    );
  });
});
