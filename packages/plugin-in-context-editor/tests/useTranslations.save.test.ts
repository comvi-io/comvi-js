import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(() => import("./helpers/useTranslationsMocks"));
vi.mock("../src/services/translationService", mocks.mockTranslationServiceModule);
vi.mock("../src/Core", mocks.mockCoreI18nLookupModule);

import { ref } from "vue";
import { useTranslations } from "../src/composables/useTranslations";
import type { TranslationData } from "../src/types";
import {
  LANGUAGES,
  RUSSIAN,
  createManager,
  createSingularTranslationData,
  type TranslationManager,
} from "./helpers/useTranslations";

const { getTranslationMock, saveTranslationMock, getI18nInstanceMock, addMessagesMock } = mocks;

describe("useTranslations — saving", () => {
  beforeEach(() => {
    mocks.resetUseTranslationsMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates runtime cache for the provided i18n instance id", async () => {
    const manager = createManager("core-42");
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    saveTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Updated"));

    await manager.loadTranslation("home.title", "default");
    manager.updateTranslation("en", "other", "Updated");
    const saved = await manager.saveTranslation();

    expect(saved).not.toBeNull();
    expect(getI18nInstanceMock).toHaveBeenCalledWith("core-42");
    expect(addMessagesMock).toHaveBeenCalledWith({
      "en:default": {
        "home.title": "Updated",
      },
    });
  });

  it("returns explicit error when saving without loaded data", async () => {
    const manager = createManager();

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(manager.state.value.error).toBe("No translation data to save");
  });

  it("returns namespace error when save is attempted without namespace", async () => {
    const manager = createManager();
    manager.state.value.data = createSingularTranslationData("home.title", "Hello");

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(manager.state.value.error).toContain("No namespace set");
  });

  it("updates runtime cache with combined select+plural ICU", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("inbox.messages", "seed"));
    saveTranslationMock.mockResolvedValue({
      key: "inbox.messages",
      isPlural: true,
      pluralVariable: "count",
      translations: {
        en: {
          "formal:one": "You have # message",
          "formal:other": "You have # messages",
          "informal:one": "You've got # message",
          "informal:other": "You've got # messages",
        },
      },
      selectConfigs: {
        en: {
          enabled: true,
          variable: "formality",
          options: ["formal", "informal"],
        },
      },
    } satisfies TranslationData);

    await manager.loadTranslation("inbox.messages", "default");
    const saved = await manager.saveTranslation();

    expect(saved).not.toBeNull();
    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "en:default": {
        "inbox.messages":
          "{formality, select, " +
          "formal {{count, plural, one {You have # message} other {You have # messages}}} " +
          "informal {{count, plural, one {You've got # message} other {You've got # messages}}}}",
      },
    });
  });

  it("blocks the save and reports the validation failure when a value is invalid", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");
    manager.updateTranslation("en", "other", "x".repeat(5001));

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(saveTranslationMock).not.toHaveBeenCalled();
    expect(manager.state.value.error).toBe(
      'Validation failed: Translation for "other" form exceeds maximum length of 5000 characters',
    );
  });

  it("stores the error and returns null when the save request rejects", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");
    saveTranslationMock.mockRejectedValueOnce(new Error("Save failed"));

    const failedSave = await manager.saveTranslation();

    expect(failedSave).toBeNull();
    expect(manager.state.value.error).toBe("Save failed");
    expect(manager.state.value.isLoading).toBe(false);
  });

  it("still returns the saved data when no i18n runtime is available to update", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");
    getI18nInstanceMock.mockReturnValueOnce(null);
    saveTranslationMock.mockResolvedValueOnce(
      createSingularTranslationData("home.title", "Updated"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const successfulSave = await manager.saveTranslation();

    expect(successfulSave).not.toBeNull();
    expect(addMessagesMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] Cannot update runtime cache: i18n instance not available",
    );
  });

  it("rejects a save when the namespace is only whitespace", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Hello"));
    await manager.loadTranslation("home.title", "   ");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(manager.state.value.error).toBe(
      "No namespace set. Please ensure the translation has a valid namespace.",
    );
    expect(saveTranslationMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] Save failed: namespace is",
      "   ",
    );
  });

  it("save in flight → isLoading is true", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");
    saveTranslationMock.mockImplementation(() => new Promise<TranslationData>(() => undefined));

    void manager.saveTranslation();

    expect(manager.state.value.isLoading).toBe(true);
  });

  it("save settles → isLoading is false again", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");
    let resolveSave!: (value: TranslationData) => void;
    saveTranslationMock.mockImplementation(
      () =>
        new Promise<TranslationData>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const pending = manager.saveTranslation();

    resolveSave(createSingularTranslationData("home.title", "Initial"));
    await pending;

    expect(manager.state.value.isLoading).toBe(false);
  });

  it("reports a generic save error when the failure is not an Error", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");
    saveTranslationMock.mockRejectedValueOnce("offline");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(manager.state.value.error).toBe("Failed to save translation");
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] Error saving translation:",
      "offline",
    );
  });

  it("clears the unsaved-changes flags once a save succeeds", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    saveTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Updated"));
    await manager.loadTranslation("home.title", "default");
    manager.updateTranslation("en", "other", "Updated");

    await manager.saveTranslation();

    expect(manager.hasUnsavedChanges.value).toBe(false);
    expect(manager.isFieldDirty("en", "other")).toBe(false);
  });

  it("joins every validation error into the reported message", async () => {
    const manager = createManager();
    const tooLong = "x".repeat(5001);
    getTranslationMock.mockResolvedValue({
      key: "home.title",
      isPlural: false,
      translations: { en: { one: tooLong, other: tooLong } },
    } satisfies TranslationData);
    await manager.loadTranslation("home.title", "default");

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(manager.state.value.error).toBe(
      'Validation failed: Translation for "one" form exceeds maximum length of 5000 characters, ' +
        'Translation for "other" form exceeds maximum length of 5000 characters',
    );
  });

  it("updates the runtime cache with plain ICU plural when select is disabled", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("cart.items", "seed"));
    saveTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: true,
      pluralVariable: "n",
      translations: { en: { one: "# item", other: "# items" } },
    } satisfies TranslationData);

    await manager.loadTranslation("cart.items", "default");
    await manager.saveTranslation();

    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "en:default": { "cart.items": "{n, plural, one {# item} other {# items}}" },
    });
  });

  it("updates the runtime cache with the default plural variable when the data has none", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("cart.items", "seed"));
    saveTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: true,
      pluralVariable: "",
      translations: { en: { one: "# item", other: "# items" } },
    } satisfies TranslationData);

    await manager.loadTranslation("cart.items", "default");
    await manager.saveTranslation();

    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "en:default": { "cart.items": "{count, plural, one {# item} other {# items}}" },
    });
  });

  it("updates the runtime cache with the default select variable when the config has none", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "seed"));
    saveTranslationMock.mockResolvedValue({
      key: "greeting",
      isPlural: false,
      translations: { en: { formal: "Good evening", informal: "Hey" } },
      selectConfigs: { en: { enabled: true, variable: "", options: ["formal", "informal"] } },
    } satisfies TranslationData);

    await manager.loadTranslation("greeting", "default");
    await manager.saveTranslation();

    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "en:default": { greeting: "{select, select, formal {Good evening} informal {Hey}}" },
    });
  });

  it("updates the runtime cache with an empty string when the singular form is missing", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "seed"));
    saveTranslationMock.mockResolvedValue({
      key: "home.title",
      isPlural: false,
      translations: { en: {} },
    } satisfies TranslationData);

    await manager.loadTranslation("home.title", "default");
    await manager.saveTranslation();

    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "en:default": { "home.title": "" },
    });
  });

  it("falls back to one/other plural forms for a language that is not configured", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("inbox.messages", "seed"));
    saveTranslationMock.mockResolvedValue({
      key: "inbox.messages",
      isPlural: true,
      pluralVariable: "n",
      translations: { de: { "formal:one": "1 Nachricht", "formal:other": "# Nachrichten" } },
      selectConfigs: { de: { enabled: true, variable: "formality", options: ["formal"] } },
    } satisfies TranslationData);

    await manager.loadTranslation("inbox.messages", "default");
    await manager.saveTranslation();

    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "de:default": {
        "inbox.messages":
          "{formality, select, formal {{n, plural, one {1 Nachricht} other {# Nachrichten}}}}",
      },
    });
  });

  it("uses the plural forms configured for the language in the combined ICU", async () => {
    const manager = useTranslations(ref([LANGUAGES[0]!, RUSSIAN]));
    getTranslationMock.mockResolvedValue(createSingularTranslationData("inbox.messages", "seed"));
    saveTranslationMock.mockResolvedValue({
      key: "inbox.messages",
      isPlural: true,
      pluralVariable: "count",
      translations: {
        ru: {
          "formal:one": "# soobshchenie",
          "formal:few": "# soobshcheniya",
          "formal:many": "# soobshcheniy",
          "formal:other": "# soobshcheniya",
        },
      },
      selectConfigs: { ru: { enabled: true, variable: "formality", options: ["formal"] } },
    } satisfies TranslationData);

    await manager.loadTranslation("inbox.messages", "default");
    await manager.saveTranslation();

    expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
      "ru:default": {
        "inbox.messages":
          "{formality, select, formal {{count, plural, one {# soobshchenie} " +
          "few {# soobshcheniya} many {# soobshcheniy} other {# soobshcheniya}}}}",
      },
    });
  });

  describe("which languages a save sends", () => {
    const threeLanguages = (): TranslationData => ({
      key: "cart.continue",
      isPlural: false,
      translations: {
        en: { other: "Continue shopping" },
        de: { other: "Mit dem Einkaufen fortfahren" },
        fr: { other: "Continuer mes achats" },
      },
      sourceValues: {
        en: "Continue shopping",
        de: "Mit dem Einkaufen fortfahren",
        fr: "Continuer mes achats",
      },
    });

    it("one language edited → only that language is sent", async () => {
      const manager = createManager();
      getTranslationMock.mockResolvedValue(threeLanguages());
      saveTranslationMock.mockResolvedValue(threeLanguages());
      await manager.loadTranslation("cart.continue", "default");

      manager.updateTranslation("de", "other", "Weiter einkaufen");
      await manager.saveTranslation();

      expect(saveTranslationMock.mock.calls[0]?.[2]).toEqual({
        de: { other: "Weiter einkaufen" },
      });
    });

    it("value typed back to what was stored → the language is not sent", async () => {
      const manager = createManager();
      getTranslationMock.mockResolvedValue(threeLanguages());
      saveTranslationMock.mockResolvedValue(threeLanguages());
      await manager.loadTranslation("cart.continue", "default");

      manager.updateTranslation("de", "other", "Weiter einkaufen");
      manager.updateTranslation("fr", "other", "x");
      manager.updateTranslation("fr", "other", "Continuer mes achats");
      await manager.saveTranslation();

      expect(Object.keys(saveTranslationMock.mock.calls[0]?.[2] ?? {})).toEqual(["de"]);
    });

    it("plural mode switched on → every language is sent rebuilt", async () => {
      const manager = createManager();
      getTranslationMock.mockResolvedValue(threeLanguages());
      saveTranslationMock.mockResolvedValue(threeLanguages());
      await manager.loadTranslation("cart.continue", "default");

      manager.togglePluralMode(true);
      await manager.saveTranslation();

      expect(Object.keys(saveTranslationMock.mock.calls[0]?.[2] ?? {}).sort()).toEqual([
        "de",
        "en",
        "fr",
      ]);
    });
  });

  describe("a save that settles after its editing session ended", () => {
    function deferredSave() {
      let resolve!: (value: TranslationData) => void;
      let reject!: (reason: unknown) => void;
      saveTranslationMock.mockImplementationOnce(
        () =>
          new Promise<TranslationData>((res, rej) => {
            resolve = res;
            reject = rej;
          }),
      );
      return {
        resolve: (value: TranslationData) => resolve(value),
        reject: (reason: unknown) => reject(reason),
      };
    }

    /** A manager with key "first" loaded in namespace-A and its value edited. */
    async function editedFirstKey(): Promise<TranslationManager> {
      const manager = createManager();
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("first", "Old"));
      await manager.loadTranslation("first", "namespace-A");
      manager.updateTranslation("en", "other", "edited");
      return manager;
    }

    it("keeps the newer session and writes only into the scope the save started in", async () => {
      const instanceId = ref<string | undefined>("core-a");
      const manager = useTranslations(ref(LANGUAGES), instanceId);
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("first", "Old"));
      await manager.loadTranslation("first", "namespace-A");
      manager.updateTranslation("en", "other", "edited");
      const firstSave = deferredSave();
      const pending = manager.saveTranslation();

      // Discard, then open another key in another namespace and instance.
      instanceId.value = "core-b";
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("second", "Two"));
      await manager.loadTranslation("second", "namespace-B");

      firstSave.resolve(createSingularTranslationData("first", "edited"));
      const result = await pending;

      expect(result).toBeNull();
      expect(manager.currentKey.value).toBe("second");
      expect(manager.translations.value).toEqual({ en: { other: "Two" } });
      expect(manager.hasUnsavedChanges.value).toBe(false);
      expect(manager.state.value.isLoading).toBe(false);
      expect(getI18nInstanceMock.mock.calls).toEqual([["core-a"]]);
      expect(addMessagesMock).toHaveBeenCalledExactlyOnceWith({
        "en:namespace-A": { first: "edited" },
      });
    });

    it("does not report the failure of an older session's save in the newer session", async () => {
      const manager = createManager();
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("first", "Old"));
      await manager.loadTranslation("first", "namespace-A");
      manager.updateTranslation("en", "other", "edited");
      const firstSave = deferredSave();
      const pending = manager.saveTranslation();
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("second", "Two"));
      await manager.loadTranslation("second", "namespace-B");
      vi.spyOn(console, "error").mockImplementation(() => {});

      firstSave.reject(new Error("offline"));
      const result = await pending;

      expect(result).toBeNull();
      expect(manager.state.value.error).toBeNull();
      expect(manager.currentKey.value).toBe("second");
    });

    it("sends the values captured when the save started", async () => {
      const manager = createManager();
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("first", "Old"));
      await manager.loadTranslation("first", "namespace-A");
      manager.updateTranslation("en", "other", "edited");
      deferredSave();

      void manager.saveTranslation();
      manager.updateTranslation("en", "other", "typed after save");

      expect(saveTranslationMock.mock.calls[0]?.[2]).toEqual({ en: { other: "edited" } });
    });

    it("refuses a second save while the first one is pending", async () => {
      const manager = createManager();
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("first", "Old"));
      await manager.loadTranslation("first", "namespace-A");
      manager.updateTranslation("en", "other", "edited");
      const firstSave = deferredSave();

      const pending = manager.saveTranslation();
      const second = await manager.saveTranslation();

      expect(second).toBeNull();
      expect(saveTranslationMock).toHaveBeenCalledOnce();
      firstSave.resolve(createSingularTranslationData("first", "edited"));
      await pending;
    });

    it("edited key, no save started → isSaving is false", async () => {
      const manager = await editedFirstKey();

      const saving = manager.isSaving.value;

      expect(saving).toBe(false);
    });

    it("save started and still pending → isSaving is true", async () => {
      const manager = await editedFirstKey();
      deferredSave();

      void manager.saveTranslation();

      expect(manager.isSaving.value).toBe(true);
    });

    it("another key loaded while a save is pending → isSaving is false for the new session", async () => {
      const manager = await editedFirstKey();
      deferredSave();
      void manager.saveTranslation();
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("second", "Two"));

      await manager.loadTranslation("second", "namespace-B");

      expect(manager.isSaving.value).toBe(false);
    });

    it("old session's save settles after another key was loaded → isSaving stays false", async () => {
      const manager = await editedFirstKey();
      const firstSave = deferredSave();
      const pending = manager.saveTranslation();
      getTranslationMock.mockResolvedValueOnce(createSingularTranslationData("second", "Two"));
      await manager.loadTranslation("second", "namespace-B");

      firstSave.resolve(createSingularTranslationData("first", "edited"));
      await pending;

      expect(manager.isSaving.value).toBe(false);
    });
  });
});
