import { describe, it, expect } from "vitest";
import { createI18n } from "../helpers/composedHost";

describe("the composite's registerLoader() overload", () => {
  it("uses a loader function as the loader itself, not as an import map", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    i18n.registerLoader(async () => ({ greeting: "Hello" }));

    await i18n.init();

    expect(i18n.t("greeting")).toBe("Hello");
  });

  it("rejects null instead of adapting it as an import map", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    expect(() => i18n.registerLoader(null as never)).toThrow(/must be a loader function/);
  });
});
