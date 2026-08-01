import { describe, it, expect, beforeEach } from "vitest";
import { I18n } from "../../src/core/i18n";
import { clearTemplateCache, _templateCacheSize } from "../../src/core/translate";
import { icuCompiler } from "../../src/core/translate/compile-icu";
import { simpleCompiler } from "../../src/core/translate/compile-simple";
import { TK_TEXT } from "../../src/core/translate/cache";
import {
  _resetSyntaxExtensions,
  getCompilerId,
  type MessageCompiler,
} from "../../src/core/translate/syntax";

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
  it("slim and full instances resolve the same template independently", () => {
    const full = makeInstance(icuCompiler);
    const slim = makeInstance(simpleCompiler);

    expect(full.t("items" as never, { count: 2 } as never)).toBe("2 items");
    // Slim treats the ICU argument as literal passthrough — the full
    // instance's cached parse must NOT leak into the slim variant.
    expect(slim.t("items" as never, { count: 2 } as never)).toBe(PLURAL_TEMPLATE);
    // And rendering slim first-cached must not poison full either.
    expect(full.t("items" as never, { count: 1 } as never)).toBe("1 item");
  });

  it("pre-assigned ids: simple=1, icu=2", () => {
    expect(getCompilerId(simpleCompiler)).toBe(1);
    expect(getCompilerId(icuCompiler)).toBe(2);
  });

  it("a third user-injected compiler gets a WeakMap id >= 3 and its own cache variants", () => {
    // A deliberately odd compiler: every {…} argument compiles to a marker.
    const markerCompiler: MessageCompiler = {
      makeArgToken(content) {
        return [TK_TEXT, `«${content.trim().split(",")[0]}»`];
      },
    };
    const injectedId = getCompilerId(markerCompiler);
    expect(injectedId).toBeGreaterThanOrEqual(3);
    expect(getCompilerId(markerCompiler)).toBe(injectedId); // stable

    const full = makeInstance(icuCompiler);
    const slim = makeInstance(simpleCompiler);
    const injected = makeInstance(markerCompiler);

    const before = _templateCacheSize();
    expect(full.t("items" as never, { count: 2 } as never)).toBe("2 items");
    expect(slim.t("items" as never, { count: 2 } as never)).toBe(PLURAL_TEMPLATE);
    expect(injected.t("items" as never, { count: 2 } as never)).toBe("«count»");
    // Three compilers → three distinct cache entries for one template string.
    expect(_templateCacheSize()).toBe(before + 3);

    // Re-render each variant: still isolated after all three are cached.
    expect(full.t("items" as never, { count: 1 } as never)).toBe("1 item");
    expect(slim.t("items" as never, { count: 1 } as never)).toBe(PLURAL_TEMPLATE);
    expect(injected.t("items" as never, { count: 1 } as never)).toBe("«count»");
  });
});
