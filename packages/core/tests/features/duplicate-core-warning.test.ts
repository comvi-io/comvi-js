/**
 * Two copies of `@comvi/core` in one app share nothing that lives at module
 * scope: ambient tag registration, the `window.__COMVI__` queue and the static
 * template cache all belong to one copy. The failure is silent and looks like a
 * feature that "sometimes does not work", so the guard says so once, in
 * development only.
 *
 * The guard is keyed on the version, so a second evaluation of the SAME copy —
 * what `vi.resetModules()` and a dev server's module graph do routinely — is
 * not a duplicate and says nothing.
 *
 * The guard is called directly here, never reached by re-importing the host:
 * re-evaluating core's static graph inside a running test is a measurement
 * hazard (see the module's own note), and the guard keeps no module state, so
 * calling it twice is exactly what loading it twice does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assertSingleCopy } from "../../src/core/duplicateGuard";
// The same source vitest.config.ts folds into `__VERSION__`.
import pkg from "../../package.json";

const VERSION_KEY = Symbol.for("comvi.core.version");
const globalSlot = globalThis as unknown as Record<symbol, unknown>;

describe("duplicate @comvi/core detection", () => {
  beforeEach(() => {
    delete globalSlot[VERSION_KEY];
  });

  afterEach(() => {
    delete globalSlot[VERSION_KEY];
  });

  it("claims the version slot for the first copy, and says nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    assertSingleCopy();

    expect(globalSlot[VERSION_KEY]).toBe(pkg.version);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent when the same copy is loaded a second time", () => {
    assertSingleCopy();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    assertSingleCopy();

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a copy at another version already holds the slot", () => {
    globalSlot[VERSION_KEY] = "0.0.0-other";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    assertSingleCopy();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("leaves the first copy's version in the slot", () => {
    globalSlot[VERSION_KEY] = "0.0.0-other";
    vi.spyOn(console, "warn").mockImplementation(() => {});

    assertSingleCopy();

    expect(globalSlot[VERSION_KEY]).toBe("0.0.0-other");
  });

  it("names both versions and the features a second copy does not share", () => {
    globalSlot[VERSION_KEY] = "0.0.0-other";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    assertSingleCopy();

    expect(warn.mock.calls[0]?.[0]).toBe(
      `[i18n] Two copies of @comvi/core are loaded, 0.0.0-other and ${pkg.version}. Ambient tags (@comvi/core/tags), the window.__COMVI__ devtools handshake and the template cache belong to one copy each and will not be shared. Align the @comvi/core version your framework binding depends on with the one you installed directly.`,
    );
  });
});
