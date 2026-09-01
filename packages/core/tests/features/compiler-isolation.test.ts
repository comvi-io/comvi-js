import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../../src/core/i18n";
import { clearTemplateCache } from "../../src/core/translate";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { simpleCompiler } from "../../src/core/translate/compile-simple";
import {
  _resetSyntaxExtensions,
  getCompilerId,
  type MessageCompiler,
} from "../../src/core/translate/syntax";
import { countingCompiler } from "../helpers/compilers";

const PLURAL_TEMPLATE = "{count, plural, one {# item} other {# items}}";

function makeInstance(compiler: MessageCompiler) {
  const i18n = new I18n({ locale: "en", exposeGlobal: false }, compiler);
  i18n.addTranslations({ en: { items: PLURAL_TEMPLATE } });
  return i18n;
}

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("compiler isolation in the shared template cache", () => {
  it("the ICU and the simple compiler resolve the same template independently", () => {
    const icu = makeInstance(icuCompiler);
    // In DEVELOPMENT the simple-compiler instance never ingests this template
    // at all (the eager preflight throws), so the isolation claim here is that
    // the ICU entry survives a failed parse under the other id. Cache keys are
    // per compiler either way.
    const simple = new I18n({ locale: "en", exposeGlobal: false }, simpleCompiler);

    expect(icu.t("items" as never, { count: 2 } as never)).toBe("2 items");
    expect(() => simple.addTranslations({ en: { items: PLURAL_TEMPLATE } })).toThrow(
      expect.objectContaining({ code: "E_ICU_SYNTAX", argumentType: "plural" }),
    );
    // The failed parse inserted nothing, and the ICU instance is untouched.
    expect(icu.t("items" as never, { count: 1 } as never)).toBe("1 item");
  });

  it("assigns the two built-in compilers stable, distinct ids (simple=1, icu=2)", () => {
    expect(getCompilerId(simpleCompiler)).toBe(1);
    expect(getCompilerId(icuCompiler)).toBe(2);

    // Stable across calls: the id is what keys the shared template cache, so a
    // second lookup must not mint a new one.
    expect(getCompilerId(simpleCompiler)).toBe(1);
    expect(getCompilerId(icuCompiler)).toBe(2);
  });

  it("a third user-injected compiler gets a WeakMap id >= 3 and its own cache variants", () => {
    const custom = countingCompiler();
    const injectedId = getCompilerId(custom.compiler);
    expect(injectedId).toBeGreaterThanOrEqual(3);
    expect(getCompilerId(custom.compiler)).toBe(injectedId);

    const icu = makeInstance(icuCompiler);
    const injected = makeInstance(custom.compiler);

    // The ICU host compiles the shared string first: a cache keyed on the string
    // alone would serve THAT entry here, and the custom compiler would render
    // "2 items" without ever parsing.
    expect(icu.t("items" as never, { count: 2 } as never)).toBe("2 items");
    expect(injected.t("items" as never, { count: 2 } as never)).toBe("«count»");
    expect(custom.parses()).toBe(1);

    // And back again, each from its own entry — neither re-parsed, neither
    // rekeyed by the other.
    expect(icu.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(injected.t("items" as never, { count: 1 } as never)).toBe("«count»");
    expect(custom.parses()).toBe(1);
  });
});
