/**
 * @comvi/core/ssr (lot 6a, R3-25): the public way to the server payload. One implementation:
 * the same `handover` the bindings reach through `/internal`, so there is one payload format.
 */
import { describe, expect, it } from "vitest";
import * as internal from "../../src/internal";
import * as ssr from "../../src/ssr";
import { createI18n } from "../../src/instance";

describe("@comvi/core/ssr", () => {
  it("exports handover only, the very function /internal re-exports", () => {
    expect(Object.keys(ssr)).toEqual(["handover"]);
    expect(ssr.handover).toBe(internal.handover);
  });

  it("hands over the payload createI18n starts from, a failed slot as null", async () => {
    const loader = async (l: string) => {
      if (l === "uk") throw new Error("404");
      return { hi: `hi ${l}` };
    };
    const server = createI18n({ locale: "uk", fallbackLocale: "en", timeZone: "UTC", loader });
    await server.ready;
    const payload = ssr.handover(server);
    expect(payload).toMatchObject({ locale: "uk", timeZone: "UTC" });
    expect({ ...payload.catalogs.default }).toEqual({ en: { hi: "hi en" }, uk: null });
    const asked: string[] = [];
    const browser = createI18n({
      fallbackLocale: "en",
      loader: async (l) => (asked.push(l), { hi: "x" }),
      ...payload,
    });
    expect(browser.t("hi")).toBe("hi en");
    await browser.ready;
    expect(asked).toEqual([]);
  });
});
