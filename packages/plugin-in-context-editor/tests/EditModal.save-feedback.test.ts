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

  /** Starts a save that stays pending until the returned function settles it. */
  async function startPendingSave(): Promise<(value: TranslationData) => void> {
    let resolve!: (value: TranslationData) => void;
    saveTranslationMock.mockImplementationOnce(
      () => new Promise<TranslationData>((res) => (resolve = res)),
    );
    await edit("Fresh coffee, weekly");
    clickButton("Save");
    await nextTick();
    return resolve;
  }

  it("save pending → the form stays on screen with the edited values, no loading skeleton", async () => {
    saveTranslationMock.mockImplementationOnce(() => new Promise<TranslationData>(() => {}));
    await edit("Fresh coffee, weekly");

    clickButton("Save");
    await nextTick();

    expect({
      values: textareas().map((f) => f.value),
      skeleton: document.body.querySelector(".animate-pulse"),
    }).toEqual({ values: ["Fresh coffee, weekly", "Frischer Kaffee"], skeleton: null });
  });

  it("save pending → every field and the plural toggle are disabled", async () => {
    saveTranslationMock.mockImplementationOnce(() => new Promise<TranslationData>(() => {}));
    await edit("Fresh coffee, weekly");

    clickButton("Save");
    await nextTick();

    expect({
      fieldsDisabled: textareas().map((f) => f.disabled),
      pluralToggleDisabled: document.body
        .querySelector("#use-plural-forms")
        ?.hasAttribute("disabled"),
    }).toEqual({ fieldsDisabled: [true, true], pluralToggleDisabled: true });
  });

  it("pending save settles → the fields are enabled again", async () => {
    const settle = await startPendingSave();

    settle(stored("Fresh coffee, weekly"));
    await flushPromises();

    expect(textareas().map((f) => f.disabled)).toEqual([false, false]);
  });

  it("successful save → a Saved toast", async () => {
    saveTranslationMock.mockResolvedValueOnce(stored("First edit"));
    await edit("First edit");

    clickButton("Save");
    await flushPromises();

    expect(toastTitles()).toEqual(["Saved"]);
  });

  it("failed save after a successful one → the Saved toast is replaced by a dismissible error", async () => {
    saveTranslationMock.mockResolvedValueOnce(stored("First edit"));
    await edit("First edit");
    clickButton("Save");
    await flushPromises();
    if (toastTitles().join() !== "Saved") {
      throw new Error(`arrangement failed: expected a Saved toast, got [${toastTitles().join()}]`);
    }
    saveTranslationMock.mockRejectedValueOnce(new Error("Failed to save translation"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await edit("Second edit");

    clickButton("Save");
    await flushPromises();

    expect({
      toasts: toastTitles(),
      dismissible: document.body.textContent?.includes("Dismiss"),
    }).toEqual({ toasts: ["Error"], dismissible: true });
  });
});
