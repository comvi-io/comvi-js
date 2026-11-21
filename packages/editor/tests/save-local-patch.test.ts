/**
 * What a save writes back into the page, on a REAL core 0.8 instance with a REAL loader:
 * the platform save goes out for every language of the form, the local `add()` only for a
 * pair that loaded successfully (an empty catalog included). `add()` on a pair that never
 * loaded would create it, and core would then never load its catalog (lot 8 map, "Found
 * while mapping" 1); a failed pair and one still loading are left to their own load.
 *
 * The second half is owner decision D2: a server snapshot that replaces a patched pair wins,
 * and the form's unsaved text, which lives in the editor's own state, survives any publish.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { I18n, Loader } from "@comvi/core";
import { core } from "@comvi/core/internal";
import type { Language, TranslationData } from "../src/types";

const { getTranslationMock, saveTranslationMock } = vi.hoisted(() => ({
  getTranslationMock: vi.fn(),
  saveTranslationMock: vi.fn(),
}));
vi.mock("../src/services/translationService", () => ({
  getTranslation: (...args: unknown[]) => getTranslationMock(...args),
  saveTranslation: (...args: unknown[]) => saveTranslationMock(...args),
}));

import { useTranslations } from "../src/composables/useTranslations";
import { activate, deactivate, isActive } from "../src/standalone";
import { getSession } from "../src/Core";
import { pageInstance } from "./helpers/session";

const language = (code: string): Language => ({
  id: code.length,
  code,
  name: code,
  nativeName: code,
  pluralForms: ["one", "other"],
  isSource: code === "en",
});
const LANGUAGES = ["en", "de", "fr", "uk"].map(language);

/** The CDN catalogs the app loads; `fr` fails, `uk` loads only when the test lets it. */
const CDN: Record<string, Record<string, string>> = {
  en: { greet: "Hello", other: "Other" },
  de: { greet: "Hallo", other: "Andere" },
  uk: { greet: "Привіт", other: "Інше" },
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

let i18n: I18n;
let ukGate: ReturnType<typeof deferred>;

const data = (values: Record<string, string>): TranslationData => ({
  key: "greet",
  isPlural: false,
  translations: Object.fromEntries(Object.entries(values).map(([l, v]) => [l, { other: v }])),
});

beforeEach(async () => {
  ukGate = deferred();
  const loader: Loader = async (locale) => {
    if (locale === "fr") throw new Error("fr is down");
    if (locale === "uk") await ukGate.promise;
    return { ...CDN[locale] };
  };
  i18n = pageInstance({ loader, onError: () => {} });
  await i18n.ready;
  activate({ apiKey: "test-key", refreshMessages: false });
  getTranslationMock.mockReset();
  saveTranslationMock.mockReset();
});

afterEach(() => {
  ukGate.resolve();
  if (isActive()) deactivate();
  i18n.destroy();
  delete (window as { __COMVI__?: unknown }).__COMVI__;
});

/** Opens `greet` in the form with every language, edits them all and saves. */
async function saveAll(values: Record<string, string>) {
  const target = getSession()!.list()[0]!;
  const manager = useTranslations(ref(LANGUAGES), undefined, target);
  getTranslationMock.mockResolvedValue(data({ en: "Hello", de: "Hallo", fr: "", uk: "" }));
  saveTranslationMock.mockImplementation(async () => data(values));
  await manager.loadTranslation("greet", "default");
  for (const [lang, value] of Object.entries(values))
    manager.updateTranslation(lang, "other", value);
  await manager.saveTranslation();
  return manager;
}

const slots = () => Object.keys(getSession()!.list()[0]!.x.state().c.default ?? {}).sort();
const t = (key: string, locale?: string) =>
  i18n.t(key, { markers: false, ...(locale ? { locale } : {}) });

describe("the local patch after a save", () => {
  it("saving de while the page shows en → no partial de catalog is created", async () => {
    await saveAll({ en: "Hi!", de: "Hallo!" });

    expect(slots()).toEqual(["en"]);
  });

  it("…then switching to de loads the FULL de catalog: every key is there", async () => {
    await saveAll({ en: "Hi!", de: "Hallo!" });

    await i18n.setLocale("de");

    expect({ greet: t("greet"), other: t("other") }).toEqual({ greet: "Hallo", other: "Andere" });
  });

  it("the loaded pair (en) shows the saved value at once", async () => {
    await saveAll({ en: "Hi!", de: "Hallo!" });

    expect({ greet: t("greet"), other: t("other") }).toEqual({ greet: "Hi!", other: "Other" });
  });

  it("a failed pair (fr) and a pair still loading (uk) are not patched locally", async () => {
    await i18n.setLocale("fr").catch(() => {});
    const switching = i18n.setLocale("uk");
    await Promise.resolve();
    const inFlight = getSession()!.list()[0]!.x.state().ld;

    await saveAll({ en: "Hi!", fr: "Salut!", uk: "Привіт!" });
    const during = slots();
    ukGate.resolve();
    await switching;

    expect({
      inFlight,
      during,
      uk: t("greet", "uk"),
      ukOther: t("other", "uk"),
      fr: slots().includes("fr"),
    }).toEqual({
      inFlight: ["uk\0default"],
      during: ["en"],
      uk: "Привіт",
      ukOther: "Інше",
      fr: false,
    });
  });

  it("the platform save still went out for every language of the form", async () => {
    await saveAll({ en: "Hi!", de: "Hallo!", fr: "Salut!", uk: "Привіт!" });

    expect(Object.keys(saveTranslationMock.mock.calls[0]![2]).sort()).toEqual([
      "de",
      "en",
      "fr",
      "uk",
    ]);
  });

  it("an empty catalog that loaded is a loaded pair: it is patched", async () => {
    await i18n.destroy();
    delete (window as { __COMVI__?: unknown }).__COMVI__;
    deactivate();
    i18n = pageInstance({ loader: async (l) => (l === "en" ? {} : { ...CDN[l] }) });
    await i18n.ready;
    activate({ apiKey: "test-key", refreshMessages: false });

    await saveAll({ en: "Hi!" });

    expect(t("greet")).toBe("Hi!");
  });
});

describe("a server snapshot over a local patch (owner D2)", () => {
  it("a snapshot of the same pair replaces the patch: the snapshot wins, nothing re-applies it", async () => {
    await saveAll({ en: "Hi!" });

    core(i18n).f("en", "default", { greet: "Hello (server)", other: "Other" });
    await Promise.resolve();

    expect(t("greet")).toBe("Hello (server)");
  });

  it("the form's unsaved text survives a snapshot of the pair it edits", async () => {
    const manager = await saveAll({ en: "Hi!" });
    manager.updateTranslation("en", "other", "Typing, not saved");

    core(i18n).f("en", "default", { greet: "Hello (server)" });
    await Promise.resolve();

    expect({
      text: manager.state.value.data?.translations.en?.other,
      dirty: manager.state.value.isDirty,
    }).toEqual({ text: "Typing, not saved", dirty: true });
  });

  it("a patch of a pair the snapshot does not contain survives it", async () => {
    await i18n.setLocale("de");
    await i18n.setLocale("en");
    await saveAll({ en: "Hi!", de: "Hallo!" });

    core(i18n).f("en", "default", { greet: "Hello (server)" });
    await Promise.resolve();

    expect(t("greet", "de")).toBe("Hallo!");
  });
});
