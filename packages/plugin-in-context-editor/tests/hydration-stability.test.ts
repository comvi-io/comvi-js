import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "@comvi/core";
import { InContextEditorPlugin } from "../src/index";
import { getKeyMappings } from "../src/translation";

const TRANSLATIONS = {
  "en:default": {
    a_key: "A value",
    b_key: "B value",
  },
} as const;

async function createServerLikeI18n() {
  // Force non-browser branch in plugin to avoid starting DOM watcher.
  vi.stubGlobal("window", undefined);
  vi.stubGlobal("document", undefined);

  const i18n = createI18n({
    locale: "en",
    defaultNs: "default",
    translation: TRANSLATIONS,
  });

  i18n.use(InContextEditorPlugin());
  await i18n.init();
  return i18n;
}

describe("InContextEditor hydration stability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assigns stable marker IDs regardless of first t() call order", async () => {
    const i18nFirstB = await createServerLikeI18n();
    i18nFirstB.t("b_key");
    i18nFirstB.t("a_key");
    const firstRunMappings = getKeyMappings();
    await i18nFirstB.destroy();

    const i18nFirstA = await createServerLikeI18n();
    i18nFirstA.t("a_key");
    i18nFirstA.t("b_key");
    const secondRunMappings = getKeyMappings();
    await i18nFirstA.destroy();

    expect(firstRunMappings["default:a_key"]).toBe(secondRunMappings["default:a_key"]);
    expect(firstRunMappings["default:b_key"]).toBe(secondRunMappings["default:b_key"]);
  });
});
