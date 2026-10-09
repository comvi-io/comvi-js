import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, inject, nextTick, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import EditModal from "../src/components/EditModal.vue";
import ModalFooter from "../src/components/editModal/ModalFooter.vue";
import type { TranslationData } from "../src/types";

const getTranslationMock = vi.fn();
const saveTranslationMock = vi.fn();
const addMessagesMock = vi.fn();

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
  ],
}));

vi.mock("../src/Core", () => ({
  getI18nInstance: () => ({ addMessages: addMessagesMock }),
}));

vi.mock("../src/config/api", () => ({ isDemoMode: () => false }));

type Manager = {
  isSaving: { value: boolean };
  currentKey: { value: string | undefined };
  updateTranslation: (lang: string, form: string, value: string) => void;
};

let manager: Manager;
const BodyStub = defineComponent({
  setup() {
    manager = inject<Manager>("translationManager")!;
    return () => h("div");
  },
});

function singular(key: string, value: string): TranslationData {
  return { key, isPlural: false, translations: { en: { other: value } } };
}

function deferredSave() {
  let resolve!: (value: TranslationData) => void;
  saveTranslationMock.mockImplementationOnce(
    () => new Promise<TranslationData>((res) => (resolve = res)),
  );
  return (value: TranslationData) => resolve(value);
}

describe("EditModal save session", () => {
  let wrapper: VueWrapper;
  const open = ref(false);
  const key = ref("first");
  const ns = ref("namespace-A");
  const instance = ref<string | undefined>("core-a");

  beforeEach(async () => {
    getTranslationMock.mockReset();
    saveTranslationMock.mockReset();
    addMessagesMock.mockReset();
    open.value = false;
    key.value = "first";
    ns.value = "namespace-A";
    getTranslationMock.mockImplementation(async (k: string) => singular(k, "Old"));
    wrapper = mount(EditModal, {
      props: {
        open,
        translationKey: key,
        translationNamespace: ns,
        translationInstanceId: instance,
        "onUpdate:open": (value: boolean) => (open.value = value),
      },
      global: {
        stubs: { ModalBody: BodyStub, ModalHeader: true },
      },
      attachTo: document.body,
    });
    open.value = true;
    await flushPromises();
    manager.updateTranslation("en", "other", "edited");
    await nextTick();
  });

  afterEach(() => {
    wrapper.unmount();
  });

  function pressSaveShortcut() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true }),
    );
  }

  it("shows the keyboard save as pending in the footer", async () => {
    const resolve = deferredSave();

    pressSaveShortcut();
    await nextTick();

    const footer = wrapper.findComponent(ModalFooter);
    const buttons = footer.findAll("button");
    expect(buttons.map((b) => b.text())).toEqual(["Cancel", "Saving...", "Saving..."]);
    expect(buttons.every((b) => b.attributes("disabled") !== undefined)).toBe(true);

    resolve(singular("first", "edited"));
    await flushPromises();
    expect(footer.findAll("button").map((b) => b.text())).toEqual([
      "Cancel",
      "Save",
      "Save & Close",
    ]);
  });

  it("keeps the modal open on Escape while a save is pending", async () => {
    const resolve = deferredSave();
    pressSaveShortcut();
    await nextTick();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await flushPromises();

    expect(open.value).toBe(true);
    expect(document.body.textContent).not.toContain("Unsaved Changes");
    resolve(singular("first", "edited"));
    await flushPromises();
  });

  it("does not let a save from a discarded session close or replace the reopened one", async () => {
    const resolve = deferredSave();
    await wrapper.findComponent(ModalFooter).findAll("button")[2]!.trigger("click");

    // The page opens another key while the first save is still in flight.
    key.value = "second";
    ns.value = "namespace-B";
    await flushPromises();
    resolve(singular("first", "edited"));
    await flushPromises();

    expect(open.value).toBe(true);
    expect(manager.currentKey.value).toBe("second");
    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "en:namespace-A": { first: "edited" },
    });
  });
});
