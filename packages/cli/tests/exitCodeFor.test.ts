import { describe, expect, it } from "vitest";
import { ErrorCodes, exitCodeFor, TypegenError } from "../src/utils/errors";
import { localeKey, resolveLocales } from "../src/utils/locales";

const http = (status: number, code?: string) =>
  new TypegenError("failed", ErrorCodes.API_FETCH_FAILED, undefined, { status, code });

describe("exitCodeFor", () => {
  it.each([
    ["a 404 for a project that no longer exists", http(404, "PROJECT_NOT_FOUND"), 3],
    ["a 404 from a wrong base URL", http(404, "NOT_FOUND"), 4],
    ["a plan limit on the commit", http(403, "LIMIT_EXCEEDED"), 4],
    ["any other 403", http(403, "FORBIDDEN"), 3],
    ["a 409 the platform rolled back twice", http(409, "TRANSACTION_CONFLICT"), 2],
    ["a 400", http(400), 4],
    ["an unreadable local translation file", new TypegenError("x", ErrorCodes.FS_READ_FAILED), 4],
    ["a local file that cannot be written", new TypegenError("x", ErrorCodes.FS_WRITE_FAILED), 1],
    ["a bug", new TypeError("x is undefined"), 1],
  ])("maps %s", (_label, error, code) => {
    expect(exitCodeFor(error)).toBe(code);
  });
});

describe("locale spelling, as the platform compares it", () => {
  it.each([
    ["pt-BR", "pt-br"],
    ["pt_BR", "pt-br"],
    ["pt__BR", "pt-br"],
    ["pt-BR-", "pt-br"],
    [" EN ", "en"],
  ])("%j is %j", (code, key) => {
    expect(localeKey(code)).toBe(key);
  });

  it("reports two spellings of one locale even when the project lacks it", () => {
    expect(resolveLocales(["fr_FR", "fr-FR", "en"], ["en"]).duplicates).toEqual([
      { locale: "fr-FR", spellings: ["fr_FR", "fr-FR"] },
    ]);
  });
});
