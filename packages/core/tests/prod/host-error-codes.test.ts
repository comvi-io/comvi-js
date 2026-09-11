/**
 * The host's construction, composition and lifecycle guards in a PRODUCTION
 * build.
 *
 * None is dev-only: a host with no locale cannot translate, a destroyed one
 * cannot be revived, and a `.use` that composed nothing must still say so — so
 * all three throw in every build and only the wording collapses to a bare `E_*`
 * code. `E_USE_NOT_INSTALLER` is one of the three codes the docs promise
 * consumers can branch on, so the bare message AND the `code` are both pinned.
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

describe(".use(f) with a non-installer", () => {
  it("throws the bare E_USE_NOT_INSTALLER code, with the code still on the error", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect(() =>
      i18n.use((() => undefined) as unknown as (host: typeof i18n) => typeof i18n),
    ).toThrowError(
      expect.objectContaining({ message: "E_USE_NOT_INSTALLER", code: "E_USE_NOT_INSTALLER" }),
    );
  });

  it("says nothing more than the code for an async plugin either", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    // The dev build names the typeof and the thenable-ness here; production
    // must not, or the diagnostic strings would be shipping after all.
    let message = "";
    try {
      i18n.use((async () => {}) as unknown as (host: typeof i18n) => typeof i18n);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("E_USE_NOT_INSTALLER");
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
