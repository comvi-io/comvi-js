/**
 * Two copies of `@comvi/core` in one app share nothing that lives at module
 * scope: ambient tag registration, the `window.__COMVI__` queue and the static
 * template cache all belong to one copy. The failure is silent and looks like a
 * feature that "sometimes does not work", so the guard says so once, in
 * development only.
 *
 * The guard is keyed on the version, so a second copy at the SAME version — and
 * a dev server re-running one module graph — is not reported.
 *
 * `claimCoreInstance` is called directly with explicit versions. Nothing here
 * imports the host, resets the module registry, or uses a dynamic `import()`:
 * first-evaluating a module inside a running test is a measurement hazard (see
 * the guard module's own note), and the function keeps no module state, so
 * calling it twice is exactly what loading two copies does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { claimCoreInstance } from "../../src/core/duplicateGuard";

const VERSION_KEY = Symbol.for("comvi.core.version");
const globalSlot = globalThis as unknown as Record<symbol, unknown>;

describe("duplicate @comvi/core detection", () => {
  beforeEach(() => {
    delete globalSlot[VERSION_KEY];
  });

  afterEach(() => {
    delete globalSlot[VERSION_KEY];
  });

  it("claims the slot for the first copy, and says nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    claimCoreInstance("0.5.0");

    expect(globalSlot[VERSION_KEY]).toBe("0.5.0");
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent for a second copy at the same version", () => {
    claimCoreInstance("0.5.0");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    claimCoreInstance("0.5.0");

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once when a copy at another version already holds the slot", () => {
    claimCoreInstance("0.5.0");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    claimCoreInstance("0.4.0");

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("leaves the first copy's version in the slot", () => {
    claimCoreInstance("0.5.0");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    claimCoreInstance("0.4.0");

    expect(globalSlot[VERSION_KEY]).toBe("0.5.0");
  });

  it("names both versions and the features a second copy does not share", () => {
    claimCoreInstance("0.5.0");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    claimCoreInstance("0.4.0");

    expect(warn.mock.calls[0]?.[0]).toBe(
      "[@comvi/core] Two copies of @comvi/core are loaded, 0.5.0 and 0.4.0. Ambient tags (@comvi/core/tags), the window.__COMVI__ devtools handshake and the template cache belong to one copy each and will not be shared. Align the @comvi/core version your framework binding depends on with the one you installed directly.",
    );
  });

  it("claims an empty version when the build defines none", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    claimCoreInstance("");

    expect(globalSlot[VERSION_KEY]).toBe("");
    expect(warn).not.toHaveBeenCalled();
  });
});
