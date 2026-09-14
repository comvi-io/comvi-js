// `VueI18n.use`'s identity refusal, asserted against BOTH published build
// families — this is vue's prod lane, and `E_USE_HOST_IDENTITY` is one of the
// three codes the docs promise consumers can branch on.
//
// The expected messages are written out verbatim rather than imported from the
// wrapper: importing them would compare the artifact against itself and pass no
// matter what it says. `__COMVI_CORE_BUILD__` is defined per vitest project and
// says which build condition this run compiled under.
import { describe, it, expect, vi } from "vitest";
import { createI18n as createCore } from "@comvi/core";
import { createI18n } from "../../src/index";

/* global __COMVI_CORE_BUILD__ */
const IS_DEV_BUILD = __COMVI_CORE_BUILD__ === "development";

const EXPECTED_MESSAGE = IS_DEV_BUILD
  ? "[i18n] .use(installer) must return the host it was given. A raw plugin goes through .use(definePlugin(f)) or registerPlugin(f); a plugin package's installer is the name WITHOUT the Plugin suffix (localeDetector(), not localeDetectorPlugin())."
  : "E_USE_HOST_IDENTITY";

describe("VueI18n.use() identity refusal", () => {
  it("carries the branchable code in both builds and only the code in production", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const foreign = createCore({ locale: "en", exposeGlobal: false });

    let thrown;
    try {
      i18n.use(() => foreign);
    } catch (error) {
      thrown = error;
    }

    expect(thrown.code).toBe("E_USE_HOST_IDENTITY");
    expect(thrown.message).toBe(EXPECTED_MESSAGE);
    expect(i18n.core).not.toBe(foreign);
  });

  it("swallows the rejection an already-invoked async plugin left behind", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(() =>
        i18n.use(async () => {
          throw new Error("the plugin's own failure");
        }),
      ).toThrow(expect.objectContaining({ code: "E_USE_HOST_IDENTITY" }));

      // Two macrotask turns: enough for node to have reported one.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
