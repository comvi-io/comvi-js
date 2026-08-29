import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "./helpers/composedHost";
import { InContextEditorPlugin } from "../src/index";
import { getKeyMappings, resetEncoder } from "../src/translation";

// Declared out of sorted order on purpose: ids come from a sort of the pending
// `namespace:key` set (`src/index.ts` flushPendingKeys), not from either the
// catalog's declaration order or the order keys are first requested.
const TRANSLATIONS = {
  "en:default": {
    b_key: "B value",
    a_key: "A value",
  },
};

async function createServerLikeI18n(
  translation: Record<string, Record<string, string>> = TRANSLATIONS,
) {
  const i18n = createI18n({
    locale: "en",
    defaultNs: "default",
    translation,
  });

  i18n.use(InContextEditorPlugin());
  await i18n.init();
  return i18n;
}

describe("InContextEditor hydration stability", () => {
  beforeEach(() => {
    // Force the plugin's non-browser branch so no DOM watcher starts.
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
  });

  afterEach(() => {
    resetEncoder();
  });

  it("assigns the same sorted-key-order ids on every server run, independent of the catalog's declaration order", async () => {
    const firstRun = await createServerLikeI18n();
    // A single t() flushes the whole namespace, so which key triggers it — and
    // in what order — cannot influence the ids. The catalog's order can, and is
    // what this pins: b_key is declared first but still gets the second id.
    firstRun.t("b_key");
    const firstRunMappings = getKeyMappings();
    await firstRun.destroy();

    const secondRun = await createServerLikeI18n();
    secondRun.t("a_key");
    const secondRunMappings = getKeyMappings();
    await secondRun.destroy();

    expect(firstRunMappings).toEqual({ "default:a_key": 1, "default:b_key": 2 });
    expect(secondRunMappings).toEqual({ "default:a_key": 1, "default:b_key": 2 });
  });

  it("gives a key that only exists in a later run its own id, never one already in use", async () => {
    const first = await createServerLikeI18n();
    first.t("a_key");
    const firstRunMappings = getKeyMappings();
    await first.destroy();

    const second = await createServerLikeI18n({
      "en:default": { c_key: "C value", b_key: "B value", a_key: "A value" },
    });
    second.t("a_key");
    const secondRunMappings = getKeyMappings();
    await second.destroy();

    expect(firstRunMappings).toEqual({ "default:a_key": 1, "default:b_key": 2 });
    expect(secondRunMappings).toEqual({
      "default:a_key": 1,
      "default:b_key": 2,
      "default:c_key": 3,
    });
  });
});
