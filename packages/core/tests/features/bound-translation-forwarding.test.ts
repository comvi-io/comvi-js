import { describe, expect, it } from "vitest";
import { createI18n, createBoundTranslation } from "../../src";

type Host = Parameters<typeof createBoundTranslation>[0];

// A hand-built host is the point here: `createBoundTranslation` takes anything
// structural with `t` and an OPTIONAL `tRaw`, and a real `I18n` always has both,
// so the no-`tRaw` half of the contract has no other way to be exercised.
function makeHost(withRaw: boolean): Host {
  const host: { t: (key: string) => string; tRaw?: (key: string) => string } = {
    t: (key) => `t:${key}`,
  };
  if (withRaw) host.tRaw = (key) => `tRaw:${key}`;
  return host as unknown as Host;
}

describe("createBoundTranslation()", () => {
  it("routes through tRaw when the host has one", () => {
    expect(createBoundTranslation(makeHost(true))("hello")).toBe("tRaw:hello");
  });

  it("routes through t when the host has no tRaw", () => {
    expect(createBoundTranslation(makeHost(false))("hello")).toBe("t:hello");
  });

  it("binds nothing for an empty namespace, so lookups keep hitting the default one", () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ "en:default": { hello: "Hello" } });

    expect(createBoundTranslation(i18n, "")("hello")).toBe("Hello");
  });
});
