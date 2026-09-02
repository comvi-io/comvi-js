/**
 * The host's construction and lifecycle guards in a PRODUCTION build.
 *
 * Neither is dev-only: a host with no locale cannot translate and a destroyed
 * one cannot be revived, so both throw in every build and only the wording
 * collapses to a bare `E_*` code.
 */
import { describe, it, expect } from "vitest";
import { createI18n } from "../../src";

describe("construction", () => {
  it("throws the bare E_LOCALE_NOT_SET code when no locale is given", () => {
    expect(() => createI18n({ exposeGlobal: false } as never)).toThrowError(
      expect.objectContaining({ message: "E_LOCALE_NOT_SET" }),
    );
  });

  it("throws the bare E_LOCALE_NOT_SET code for an empty locale", () => {
    expect(() => createI18n({ locale: "", exposeGlobal: false })).toThrowError(
      expect.objectContaining({ message: "E_LOCALE_NOT_SET" }),
    );
  });
});

describe("init() after destroy()", () => {
  it("rejects with the bare E_INSTANCE_DESTROYED code", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    await i18n.destroy();

    await expect(i18n.init()).rejects.toThrowError(
      expect.objectContaining({ message: "E_INSTANCE_DESTROYED" }),
    );
  });
});
