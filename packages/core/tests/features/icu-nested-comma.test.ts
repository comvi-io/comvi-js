/**
 * COM-148: a comma that sits only inside a nested brace group never makes the
 * argument a parameter. `icuCompiler` looks for the ICU type comma at the
 * argument's own depth; finding one only deeper (`{{,}\t}`,
 * `{{count, plural, …}}`) is refused in development with `E_ICU_SYNTAX`, as the
 * default compiler refuses the same text. Production renders it literally
 * (`tests/prod/icu-nested-comma.test.ts`).
 */
import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { simpleCompiler } from "../../src/core/translate/compile-simple";

const COMPILERS = [
  { name: "default compiler", compiler: simpleCompiler },
  { name: "icuCompiler", compiler: icuCompiler },
];

function host(compiler: typeof icuCompiler, messages: Record<string, string>) {
  return createI18n({ locale: "en", exposeGlobal: false, compiler, messages: { en: messages } });
}

describe("a comma only in a nested brace group", () => {
  it.each(COMPILERS)(
    "$name: `{{,}\\t}` is refused at ingestion with E_ICU_SYNTAX",
    ({ compiler }) => {
      let error: unknown;
      try {
        host(compiler, { odd: "{{,}\t}" });
      } catch (caught) {
        error = caught;
      }

      expect((error as { code?: string } | undefined)?.code).toBe("E_ICU_SYNTAX");
    },
  );

  it.each(COMPILERS)(
    "$name: a plural wrapped in a second pair of braces is refused with its type",
    ({ compiler }) => {
      let error: unknown;
      try {
        host(compiler, { items: "{{count, plural, one {# item} other {# items}}}" });
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({ code: "E_ICU_SYNTAX", argumentType: "plural" });
    },
  );

  it("icuCompiler: a quoted comma in a nested group is literal text, not a type marker", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = host(icuCompiler, { quoted: "{name '{,}'}" });

    expect(i18n.t("quoted", { "name '{,}'": "x" } as never)).toBe("x");
  });

  it("icuCompiler: a nested group without any comma stays a parameter", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = host(icuCompiler, { braces: "{a {b}}" });

    expect(i18n.t("braces", { "a {b}": "ok" } as never)).toBe("ok");
  });
});
