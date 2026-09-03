/**
 * Two copies of `@comvi/core` in one app share nothing that lives at module
 * scope: ambient tag registration, the `window.__COMVI__` queue and the static
 * template cache all belong to one copy. The failure is silent and looks like a
 * feature that "sometimes does not work", so the host module says so once, in
 * development only.
 *
 * The guard is keyed on the version, so re-evaluating the SAME copy — which is
 * what `vi.resetModules()` and a dev server's module graph do routinely — is
 * not a duplicate and says nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The same source vitest.config.ts folds into `__VERSION__`.
import pkg from "../../package.json";

const VERSION_KEY = Symbol.for("comvi.core.version");
const globalSlot = globalThis as unknown as Record<symbol, unknown>;

describe("duplicate @comvi/core detection", () => {
  beforeEach(() => {
    delete globalSlot[VERSION_KEY];
    vi.resetModules();
  });

  afterEach(() => {
    delete globalSlot[VERSION_KEY];
  });

  it("stays silent when one copy of the host module is loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent when the same copy is evaluated a second time", async () => {
    await import("../../src/core/i18n");
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a copy at another version is already loaded", async () => {
    globalSlot[VERSION_KEY] = "0.0.0-other";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("names both versions and the features a second copy does not share", async () => {
    globalSlot[VERSION_KEY] = "0.0.0-other";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await import("../../src/core/i18n");

    expect(warn.mock.calls[0]?.[0]).toBe(
      `[i18n] Two copies of @comvi/core are loaded, 0.0.0-other and ${pkg.version}. Ambient tags (@comvi/core/tags), the window.__COMVI__ devtools handshake and the template cache belong to one copy each and will not be shared. Align the @comvi/core version your framework binding depends on with the one you installed directly.`,
    );
  });
});
