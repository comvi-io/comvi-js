import { describe, expect, it } from "vitest";
import { normalizeLocaleCookie, serializeLocaleCookie } from "../src/index";

const resolved = (cookie?: Parameters<typeof normalizeLocaleCookie>[0]) => {
  const result = normalizeLocaleCookie(cookie, "NEXT_LOCALE");
  if (result === false) throw new Error("the fixture asked for no cookie");
  return result;
};

describe("serializeLocaleCookie", () => {
  it("default attributes on HTTPS → a year-long, site-wide, lax, secure cookie", () => {
    const assignment = serializeLocaleCookie(resolved(), "de", true);

    expect(assignment).toBe("NEXT_LOCALE=de; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });

  it("a plain-HTTP page → no Secure attribute, so the browser keeps the cookie", () => {
    const assignment = serializeLocaleCookie(resolved(), "de", false);

    expect(assignment).toBe("NEXT_LOCALE=de; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("every configured attribute → written as configured", () => {
    const cookie = resolved({
      name: "LANG",
      maxAge: 60,
      sameSite: "strict",
      domain: "example.com",
    });

    const assignment = serializeLocaleCookie(cookie, "pt-BR", true);

    expect(assignment).toBe(
      "LANG=pt-BR; Path=/; Max-Age=60; SameSite=Strict; Domain=example.com; Secure",
    );
  });

  it("a value with cookie syntax in it → percent-encoded, never a second attribute", () => {
    const assignment = serializeLocaleCookie(resolved(), "de; Domain=evil.example", false);

    expect(assignment).toBe(
      "NEXT_LOCALE=de%3B%20Domain%3Devil.example; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});
