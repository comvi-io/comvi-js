import { describe, it, expect, vi, beforeEach } from "vitest";
// IMPORTANT: this file never imports "../../src" (the root entry), so no
// ambient tag registration and no ICU wiring happen behind its back.
import { createI18n } from "../../src/slim";
import { icuCompiler } from "../../src/icu";
import { clearTemplateCache } from "../../src/core/translate";
import { _resetSyntaxExtensions, getAmbientExtensions } from "../../src/core/translate/syntax";

beforeEach(() => {
  _resetSyntaxExtensions();
  clearTemplateCache();
});

describe("@comvi/core/slim", () => {
  it("does not register any ambient syntax extension", () => {
    expect(getAmbientExtensions().length).toBe(0);
  });

  it("interpolates {param} like the full entry", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greet: "Hello, {name}!", plain: "Just text" } },
    });
    expect(i18n.t("greet" as never, { name: "Ada" } as never)).toBe("Hello, Ada!");
    expect(i18n.t("plain" as never)).toBe("Just text");
  });

  it("passes ICU templates through literally and warns once per template in dev", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const template = `{count_${Date.now()}, plural, one {# item} other {# items}}`;
    const i18n = createI18n({
      locale: "en",
      translation: { en: { items: template } },
    });

    expect(i18n.t("items" as never, { count: 2 } as never)).toBe(template);
    i18n.t("items" as never, { count: 3 } as never);

    const matching = warnSpy.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("ICU syntax detected"),
    );
    expect(matching.length).toBe(1);
    expect(matching[0][0]).toContain("@comvi/core/icu");
    warnSpy.mockRestore();
  });

  it("renders <tag> markup literally (no tag graph in slim)", () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "<link>hi</link>" } },
    });
    expect(i18n.t("msg" as never)).toBe("<link>hi</link>");
  });

  it("injected icuCompiler (from @comvi/core/icu) restores plural behavior", () => {
    const i18n = createI18n({
      locale: "en",
      compiler: icuCompiler,
      translation: { en: { items: "{count, plural, one {# item} other {# items}}" } },
    });
    expect(i18n.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(i18n.t("items" as never, { count: 5 } as never)).toBe("5 items");
  });
});
