/**
 * The three `ERR_*` constants built once at MODULE SCOPE in `core/i18n.ts`.
 *
 * Their wording is asserted elsewhere, but always against a module that was
 * evaluated when the test FILE was imported — before any test began. Each case
 * below resets the module registry and imports the package inside the test, so
 * the constants are built while this test is the one running: that is what puts
 * the development wording under a test's own responsibility instead of leaving
 * it to import-time side effects.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.resetModules();
});

async function freshCore() {
  vi.resetModules();
  return import("../../src");
}

describe("core error messages, built at module scope", () => {
  it("names the missing locale option", async () => {
    const { createI18n } = await freshCore();

    expect(() => createI18n({ exposeGlobal: false } as never)).toThrowError(
      expect.objectContaining({ message: "@comvi/core: Locale is not set" }),
    );
  });

  it("names the malformed translation option", async () => {
    const { createI18n } = await freshCore();

    expect(() =>
      createI18n({ locale: "en", exposeGlobal: false, translation: null as never }),
    ).toThrowError(
      expect.objectContaining({ message: "@comvi/core: Translation is not an object" }),
    );
  });

  it("tells a destroyed instance that a fresh one is the only way forward", async () => {
    const { createI18n } = await freshCore();
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    await i18n.destroy();

    await expect(i18n.init()).rejects.toThrowError(
      expect.objectContaining({
        message: "[i18n] Cannot call init() after destroy(). Create a new i18n instance.",
      }),
    );
  });
});
