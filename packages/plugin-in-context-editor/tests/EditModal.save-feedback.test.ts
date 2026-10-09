import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import App from "../src/App.vue";
import type { TranslationData } from "../src/types";

const getTranslationMock = vi.fn();
const saveTranslationMock = vi.fn();

vi.mock("../src/services/translationService", () => ({
  getTranslation: (...args: unknown[]) => getTranslationMock(...args),
  saveTranslation: (...args: unknown[]) => saveTranslationMock(...args),
}));

vi.mock("../src/services/languageService", () => ({
  getLanguages: async () => [
    {
      id: 1,
      code: "en",
      name: "English",
      nativeName: "English",
      pluralForms: ["one", "other"],
      isSource: true,
    },
    {
      id: 2,
      code: "de",
      name: "German",
      nativeName: "Deutsch",
      pluralForms: ["one", "other"],
      isSource: false,
    },
  ],
}));

vi.mock("../src/Core", () => ({
  getI18nInstance: () => ({ addMessages: vi.fn() }),
}));

vi.mock("../src/config/api", () => ({ isDemoMode: () => false }));

function stored(en: string): TranslationData {
  return {
    key: "hero.title",
    isPlural: false,
    translations: { en: { other: en }, de: { other: "Frischer Kaffee" } },
  };
}

function textareas(): HTMLTextAreaElement[] {
  return [...document.body.querySelectorAll("textarea")];
}

async function edit(value: string) {
  const field = textareas()[0]!;
  field.value = value;
  field.dispatchEvent(new Event("input"));
  await nextTick();
}

function clickButton(label: string) {
  const button = [...document.body.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no "${label}" button`);
  button.click();
}

function toastTitles(): string[] {
  return [...document.body.querySelectorAll(".fixed.bottom-4 p.font-medium")].map(
    (p) => p.textContent?.trim() ?? "",
  );
}

describe("EditModal save feedback", () => {
  let wrapper: VueWrapper;

  beforeEach(async () => {
    getTranslationMock.mockReset();
    saveTranslationMock.mockReset();
    getTranslationMock.mockResolvedValue(stored("Fresh coffee"));
    wrapper = mount(App, {
      props: {
        open: ref(true),
        translationKey: ref("hero.title"),
        translationNamespace: ref("default"),
        translationInstanceId: ref<string | undefined>("core-a"),
      },
      attachTo: document.body,
    });
    await flushPromises();
  });

  afterEach(() => {
    wrapper.unmount();
    document.body.innerHTML = "";
  });

  it("keeps the form on screen, disabled, while a save is pending", async () => {
    let resolve!: (value: TranslationData) => void;
    saveTranslationMock.mockImplementationOnce(
      () => new Promise<TranslationData>((res) => (resolve = res)),
    );
    await edit("Fresh coffee, weekly");

    clickButton("Save");
    await nextTick();

    const fields = textareas();
    expect(fields.map((f) => f.value)).toEqual(["Fresh coffee, weekly", "Frischer Kaffee"]);
    expect(fields.every((f) => f.disabled)).toBe(true);
    expect(document.body.querySelector("#use-plural-forms")?.hasAttribute("disabled")).toBe(true);
    expect(document.body.querySelector(".animate-pulse")).toBeNull();

    resolve(stored("Fresh coffee, weekly"));
    await flushPromises();
    expect(textareas().every((f) => !f.disabled)).toBe(true);
  });

  it("replaces the earlier Saved toast with the error of a failed save", async () => {
    saveTranslationMock.mockResolvedValueOnce(stored("First edit"));
    await edit("First edit");
    clickButton("Save");
    await flushPromises();
    expect(toastTitles()).toEqual(["Saved"]);

    saveTranslationMock.mockRejectedValueOnce(new Error("Failed to save translation"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await edit("Second edit");
    clickButton("Save");
    await flushPromises();

    expect(toastTitles()).toEqual(["Error"]);
    expect(document.body.textContent).toContain("Dismiss");
  });
});
