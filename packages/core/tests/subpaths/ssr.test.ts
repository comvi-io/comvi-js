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

describe("@comvi/core/ssr: a payload React Server Components can pass (lot 6a)", () => {
  // React Flight refuses null-prototype objects from a Server Component to a Client Component
  // ("Classes or null prototypes are not supported"): `next build` of a page passing
  // `handover(i18n)` as a prop failed on it.
  const proto = (o: object) => Object.getPrototypeOf(o);

  it("every object of the payload has Object.prototype, a patched slot too", () => {
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      catalogs: { default: { en: { a: "A" } }, constructor: { en: { b: "B" } } },
    });
    i18n.add("en", { c: "C" });
    const p = ssr.handover(i18n);
    expect(proto(p)).toBe(Object.prototype);
    expect(proto(p.catalogs)).toBe(Object.prototype);
    for (const n of Object.keys(p.catalogs)) {
      expect(proto(p.catalogs[n])).toBe(Object.prototype);
      for (const l of Object.keys(p.catalogs[n]))
        expect(proto(p.catalogs[n][l]!)).toBe(Object.prototype);
    }
    expect(p.catalogs.default.en).toEqual({ a: "A", c: "C" });
    expect(Object.hasOwn(p.catalogs, "constructor")).toBe(true);
    expect(p.catalogs.constructor).toEqual({ en: { b: "B" } });
  });

  it("a patch flattened into a new base (more than 256 keys added) is handed over as a plain object too", () => {
    const i18n = createI18n({ locale: "en", timeZone: "UTC", messages: { en: { a: "A" } } });
    const many: Record<string, string> = {};
    for (let k = 0; k < 257; k++) many[`k${k}`] = `v${k}`;
    i18n.add("en", many);
    const p = ssr.handover(i18n);
    for (const n of Object.keys(p.catalogs))
      for (const l of Object.keys(p.catalogs[n]))
        expect(proto(p.catalogs[n][l]!)).toBe(Object.prototype);
    expect(p.catalogs.default.en).toMatchObject({ a: "A", k0: "v0", k256: "v256" });
  });
});
