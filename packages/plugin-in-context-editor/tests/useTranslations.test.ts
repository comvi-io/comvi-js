import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useTranslations } from "../src/composables/useTranslations";
import { DEFAULT_PLURAL_VARIABLE } from "../src/utils/icuParser";
import type { Language, TranslationData } from "../src/types";

const getTranslationMock = vi.fn();
const saveTranslationMock = vi.fn();
const getI18nInstanceMock = vi.fn();
const addTranslationsMock = vi.fn();

vi.mock("../src/services/translationService", () => ({
  getTranslation: (...args: unknown[]) => getTranslationMock(...args),
  saveTranslation: (...args: unknown[]) => saveTranslationMock(...args),
}));

vi.mock("../src/Core", () => ({
  getI18nInstance: (...args: unknown[]) => getI18nInstanceMock(...args),
}));

const LANGUAGES: Language[] = [
  {
    id: 1,
    code: "en",
    name: "English",
    nativeName: "English",
    pluralForms: ["one", "other"],
    isSource: true,
  },
];

const RUSSIAN: Language = {
  id: 2,
  code: "ru",
  name: "Russian",
  nativeName: "Russkiy",
  pluralForms: ["one", "few", "many", "other"],
  isSource: false,
};

function createManager(instanceId?: string) {
  return useTranslations(ref(LANGUAGES), instanceId ? ref(instanceId) : undefined);
}

type TranslationManager = ReturnType<typeof createManager>;

function createSingularTranslationData(key: string, value: string): TranslationData {
  return {
    key,
    isPlural: false,
    translations: {
      en: {
        other: value,
      },
    },
  };
}

/** A manager holding a loaded singular key, already switched to plural mode. */
async function loadedPluralManager(): Promise<TranslationManager> {
  const manager = createManager();
  getTranslationMock.mockResolvedValue(createSingularTranslationData("items.count", "Item"));
  await manager.loadTranslation("items.count", "default");
  manager.togglePluralMode(true);
  return manager;
}

describe("useTranslations", () => {
  beforeEach(() => {
    getTranslationMock.mockReset();
    saveTranslationMock.mockReset();
    getI18nInstanceMock.mockReset();
    addTranslationsMock.mockReset();
    getI18nInstanceMock.mockReturnValue({
      addTranslations: addTranslationsMock,
    });
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
    expect(addTranslationsMock).toHaveBeenCalledWith({
      "en:default": {
        "home.title": "Updated",
      },
    });
  });

  it("ignores stale load responses when a newer request finishes first", async () => {
    const manager = createManager();

    let resolveFirst: ((value: TranslationData) => void) | undefined;
    let resolveSecond: ((value: TranslationData) => void) | undefined;

    getTranslationMock
      .mockImplementationOnce(
        () =>
          new Promise<TranslationData>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<TranslationData>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const firstLoad = manager.loadTranslation("key.first", "default");
    const secondLoad = manager.loadTranslation("key.second", "default");

    resolveSecond?.(createSingularTranslationData("key.second", "Second"));
    await secondLoad;

    resolveFirst?.(createSingularTranslationData("key.first", "First"));
    await firstLoad;

    expect(manager.state.value.data?.key).toBe("key.second");
  });

  it("returns explicit error when saving without loaded data", async () => {
    const manager = createManager();

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(manager.state.value.error).toBe("No translation data to save");
  });

  it("stores normalized load error state when translation fetch fails", async () => {
    const manager = createManager();
    getTranslationMock.mockRejectedValueOnce(new Error("Load failed"));

    await manager.loadTranslation("home.title", "default");

    expect(manager.state.value.error).toBe("Load failed");
    expect(manager.state.value.isLoading).toBe(false);
  });

  it("clears stale translation data when a later load fails", async () => {
    const manager = createManager();
    getTranslationMock
      .mockResolvedValueOnce(createSingularTranslationData("home.title", "Welcome"))
      .mockRejectedValueOnce(new Error("Load failed"));

    await manager.loadTranslation("home.title", "default");
    expect(manager.state.value.data?.key).toBe("home.title");

    await manager.loadTranslation("missing.key", "default");

    expect(manager.state.value.data).toBeNull();
    expect(manager.state.value.error).toBe("Load failed");
    expect(manager.state.value.isDirty).toBe(false);
  });

  it("returns namespace error when save is attempted without namespace", async () => {
    const manager = createManager();
    manager.state.value.data = createSingularTranslationData("home.title", "Hello");

    const result = await manager.saveTranslation();

    expect(result).toBeNull();
    expect(manager.state.value.error).toContain("No namespace set");
  });

  it("converts translations when toggling plural mode on and off", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("items.count", "Item"));

    await manager.loadTranslation("items.count", "default");
    manager.togglePluralMode(true);

    expect(manager.state.value.data?.isPlural).toBe(true);
    expect(manager.state.value.data?.pluralVariable).toBe(DEFAULT_PLURAL_VARIABLE);
    expect(manager.state.value.data?.translations.en?.one).toBe("Item");
    expect(manager.state.value.data?.translations.en?.other).toBe("Item");

    manager.togglePluralMode(false);

    expect(manager.state.value.data?.isPlural).toBe(false);
    expect(manager.state.value.data?.translations.en).toEqual({ other: "Item" });
  });

  it("converts, reconfigures and unconverts select mode across one lifecycle", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("welcome.message", "Hello"));

    await manager.loadTranslation("welcome.message", "default");
    manager.toggleSelectMode("en", true, {
      variable: "formality",
      options: ["formal", "informal"],
    });

    expect(manager.state.value.data?.selectConfigs?.en).toEqual({
      enabled: true,
      variable: "formality",
      options: ["formal", "informal"],
    });
    expect(manager.state.value.data?.translations.en).toEqual({
      formal: "Hello",
      informal: "Hello",
    });

    manager.updateSelectConfig("en", {
      options: ["formal", "neutral", "informal"],
    });

    expect(manager.state.value.data?.translations.en).toEqual({
      formal: "Hello",
      neutral: "Hello",
      informal: "Hello",
    });

    manager.toggleSelectMode("en", false);
    expect(manager.state.value.data?.selectConfigs?.en?.enabled).toBe(false);
    expect(manager.state.value.data?.translations.en).toEqual({ other: "Hello" });
  });

  it.each([
    ["", "Plural variable name is required"],
    ["   ", "Plural variable name is required"],
    ["1count", "Plural variable name must be a valid identifier"],
    ["a".repeat(31), "Plural variable name must be 30 characters or less"],
  ])("rejects the plural variable %j", async (variable, message) => {
    const manager = await loadedPluralManager();

    manager.updatePluralVariable(variable);

    expect(manager.validate()).toEqual({
      isValid: false,
      errors: [{ languageId: "", pluralForm: "", message }],
      warnings: [],
    });
  });

  it.each(["count", "a".repeat(30)])("accepts the plural variable %j", async (variable) => {
    const manager = await loadedPluralManager();

    manager.updatePluralVariable(variable);

    expect(manager.validate().isValid).toBe(true);
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
    expect(addTranslationsMock).toHaveBeenCalledExactlyOnceWith({
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
    expect(addTranslationsMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      "[InContextEditor] Cannot update runtime cache: i18n instance not available",
    );
  });

  it.each([
    [
      "updateTranslation",
      (m: TranslationManager) => m.updateTranslation("en", "other", "Hello"),
      "Cannot update translation: no data loaded",
    ],
    [
      "updateMetadata",
      (m: TranslationManager) => m.updateMetadata({ context: "ctx" }),
      "Cannot update metadata: no data loaded",
    ],
    [
      "updatePluralVariable",
      (m: TranslationManager) => m.updatePluralVariable("count"),
      "Cannot update plural variable: no data loaded",
    ],
    [
      "togglePluralMode",
      (m: TranslationManager) => m.togglePluralMode(true),
      "Cannot toggle plural mode: no data loaded",
    ],
    [
      "toggleSelectMode",
      (m: TranslationManager) => m.toggleSelectMode("en", true),
      "Cannot toggle select mode: no data loaded",
    ],
    [
      "updateSelectConfig",
      (m: TranslationManager) => m.updateSelectConfig("en", { enabled: true }),
      "Cannot update select config: no data loaded",
    ],
  ])("warns when %s is called without loaded data", (_name, call, message) => {
    const manager = createManager();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    call(manager);

    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(message);
  });

  it("resets state to initial values", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");
    manager.updateTranslation("en", "other", "Updated");

    manager.resetState();

    expect(manager.state.value).toEqual({
      data: null,
      isLoading: false,
      error: null,
      isDirty: false,
    });
  });

  it("exposes description from loaded translation data", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "home.title",
      description: "Main heading on the homepage",
      isPlural: false,
      translations: { en: { other: "Welcome" } },
    });

    await manager.loadTranslation("home.title", "default");

    expect(manager.description.value).toBe("Main heading on the homepage");
  });

  it("returns empty string for description when not provided", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Welcome"));

    await manager.loadTranslation("home.title", "default");

    expect(manager.description.value).toBe("");
  });

  it("exposes empty defaults from every accessor before a translation is loaded", () => {
    const manager = createManager();

    expect(manager.state.value).toEqual({
      data: null,
      isLoading: false,
      error: null,
      isDirty: false,
    });
    expect(manager.currentKey.value).toBeUndefined();
    expect(manager.description.value).toBe("");
    expect(manager.translations.value).toEqual({});
    expect(manager.hasUnsavedChanges.value).toBe(false);
    expect(manager.isPlural.value).toBe(false);
    expect(manager.pluralVariable.value).toBe("");
    expect(manager.selectConfigs.value).toEqual({});
    expect(manager.getSelectConfig("en")).toBeUndefined();
  });

  it("exposes the key, translations, plural flag, variable and select config of loaded data", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: true,
      pluralVariable: "n",
      translations: { en: { one: "# item", other: "# items" } },
      selectConfigs: {
        en: { enabled: true, variable: "formality", options: ["formal", "informal"] },
      },
    } satisfies TranslationData);

    await manager.loadTranslation("cart.items", "shop");

    expect(manager.currentKey.value).toBe("cart.items");
    expect(manager.translations.value).toEqual({ en: { one: "# item", other: "# items" } });
    expect(manager.isPlural.value).toBe(true);
    expect(manager.pluralVariable.value).toBe("n");
    expect(manager.selectConfigs.value).toEqual({
      en: { enabled: true, variable: "formality", options: ["formal", "informal"] },
    });
    expect(manager.hasUnsavedChanges.value).toBe(false);
    expect(manager.getSelectConfig("en")).toEqual({
      enabled: true,
      variable: "formality",
      options: ["formal", "informal"],
    });
  });

  it("stays loading from the start of a fetch until it settles", async () => {
    const manager = createManager();
    let resolveLoad!: (value: TranslationData) => void;
    getTranslationMock.mockImplementation(
      () =>
        new Promise<TranslationData>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const pending = manager.loadTranslation("home.title", "default");

    expect(manager.state.value.isLoading).toBe(true);

    resolveLoad(createSingularTranslationData("home.title", "Welcome"));
    await pending;

    expect(manager.state.value.isLoading).toBe(false);
  });

  it("clears the state without an error when the key has no translation", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(null);

    await manager.loadTranslation("missing.key", "default");

    expect(manager.state.value).toEqual({
      data: null,
      isLoading: false,
      error: null,
      isDirty: false,
    });
  });

  it("forgets the dirty baseline when a later load finds no translation", async () => {
    const manager = createManager();
    getTranslationMock
      .mockResolvedValueOnce(createSingularTranslationData("home.title", "Welcome"))
      .mockResolvedValueOnce(null);
    await manager.loadTranslation("home.title", "default");
    manager.updateTranslation("en", "other", "Changed");

    await manager.loadTranslation("missing.key", "default");

    expect(manager.isFieldDirty("en", "other")).toBe(false);
  });

  it("reports a generic load error when the failure is not an Error", async () => {
    const manager = createManager();
    getTranslationMock.mockRejectedValueOnce("network down");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await manager.loadTranslation("home.title", "default");

    expect(manager.state.value.error).toBe("Failed to load translation");
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("Error loading translation:", "network down");
  });

  it("ignores a stale rejection while a newer request is still loading", async () => {
    const manager = createManager();
    let rejectFirst!: (reason: unknown) => void;
    let resolveSecond!: (value: TranslationData) => void;
    getTranslationMock
      .mockImplementationOnce(
        () =>
          new Promise<TranslationData>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<TranslationData>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const firstLoad = manager.loadTranslation("key.first", "default");
    const secondLoad = manager.loadTranslation("key.second", "default");
    rejectFirst(new Error("Load failed"));
    await firstLoad;

    expect(manager.state.value.error).toBeNull();
    expect(manager.state.value.isLoading).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();

    resolveSecond(createSingularTranslationData("key.second", "Second"));
    await secondLoad;

    expect(manager.state.value.data?.key).toBe("key.second");
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
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("Save failed: namespace is", "   ");
  });

  it("stays loading from the start of a save until it settles", async () => {
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

    expect(manager.state.value.isLoading).toBe(true);

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
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith("Error saving translation:", "offline");
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

    expect(addTranslationsMock).toHaveBeenCalledExactlyOnceWith({
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

    expect(addTranslationsMock).toHaveBeenCalledExactlyOnceWith({
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

    expect(addTranslationsMock).toHaveBeenCalledExactlyOnceWith({
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

    expect(addTranslationsMock).toHaveBeenCalledExactlyOnceWith({
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

    expect(addTranslationsMock).toHaveBeenCalledExactlyOnceWith({
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

    expect(addTranslationsMock).toHaveBeenCalledExactlyOnceWith({
      "ru:default": {
        "inbox.messages":
          "{formality, select, formal {{count, plural, one {# soobshchenie} " +
          "few {# soobshcheniya} many {# soobshcheniy} other {# soobshcheniya}}}}",
      },
    });
  });

  it("creates the form bucket for a language that has no translations yet", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Welcome"));
    await manager.loadTranslation("home.title", "default");

    manager.updateTranslation("de", "other", "Willkommen");

    expect(manager.translations.value).toEqual({
      en: { other: "Welcome" },
      de: { other: "Willkommen" },
    });
  });

  it("keeps earlier edits to the same language and flags unsaved changes", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("cart.items", "Item"));
    await manager.loadTranslation("cart.items", "default");

    manager.updateTranslation("en", "one", "One item");
    manager.updateTranslation("en", "other", "Many items");

    expect(manager.translations.value.en).toEqual({ one: "One item", other: "Many items" });
    expect(manager.hasUnsavedChanges.value).toBe(true);
  });

  it("reports a single error when there is no data to validate", () => {
    const manager = createManager();

    expect(manager.validate()).toEqual({
      isValid: false,
      errors: [{ languageId: "", pluralForm: "", message: "No translation data to validate" }],
    });
  });

  it("reports no dirty field before anything is loaded", () => {
    const manager = createManager();

    expect(manager.isFieldDirty("en", "other")).toBe(false);
  });

  it("reports no dirty field directly after a load", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Welcome"));

    await manager.loadTranslation("home.title", "default");

    expect(manager.isFieldDirty("en", "other")).toBe(false);
  });

  it("reports a field dirty once its value differs from the loaded one", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Welcome"));
    await manager.loadTranslation("home.title", "default");

    manager.updateTranslation("en", "other", "Welcome back");

    expect(manager.isFieldDirty("en", "other")).toBe(true);
  });

  it("reports a field clean again once it is edited back to the loaded value", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Welcome"));
    await manager.loadTranslation("home.title", "default");

    manager.updateTranslation("en", "other", "Welcome back");
    manager.updateTranslation("en", "other", "Welcome");

    expect(manager.isFieldDirty("en", "other")).toBe(false);
  });

  it("reports fields of a language outside the baseline as clean", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Welcome"));
    await manager.loadTranslation("home.title", "default");

    expect(manager.isFieldDirty("de", "other")).toBe(false);
  });

  it("reports the baseline fields dirty when a later load failed and dropped the data", async () => {
    const manager = createManager();
    getTranslationMock
      .mockResolvedValueOnce(createSingularTranslationData("home.title", "Welcome"))
      .mockRejectedValueOnce(new Error("Load failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await manager.loadTranslation("home.title", "default");

    await manager.loadTranslation("other.key", "default");

    expect(manager.isFieldDirty("en", "other")).toBe(true);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      "Error loading translation:",
      new Error("Load failed"),
    );
  });

  it("merges metadata into the loaded data and flags unsaved changes", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "home.title",
      isPlural: false,
      translations: { en: { other: "Welcome" } },
      metadata: { context: "Homepage", tags: ["seo"] },
    } satisfies TranslationData);
    await manager.loadTranslation("home.title", "default");

    manager.updateMetadata({ context: "Header" });

    expect(manager.state.value.data?.metadata).toEqual({ context: "Header", tags: ["seo"] });
    expect(manager.hasUnsavedChanges.value).toBe(true);
  });

  it("keeps an explicit plural variable when plural mode is switched on", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: false,
      pluralVariable: "n",
      translations: { en: { other: "Item" } },
    } satisfies TranslationData);
    await manager.loadTranslation("cart.items", "default");

    manager.togglePluralMode(true);

    expect(manager.pluralVariable.value).toBe("n");
  });

  it("does not invent a plural variable when plural mode is switched off", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: true,
      translations: { en: { one: "Item", other: "Items" } },
    } satisfies TranslationData);
    await manager.loadTranslation("cart.items", "default");

    manager.togglePluralMode(false);

    expect(manager.pluralVariable.value).toBe("");
  });

  it("leaves unconfigured languages untouched when converting to plural", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: false,
      translations: { en: { other: "Item" }, de: { other: "Artikel" } },
    } satisfies TranslationData);
    await manager.loadTranslation("cart.items", "default");

    manager.togglePluralMode(true);

    expect(manager.translations.value).toEqual({
      en: { one: "Item", other: "Item" },
      de: { other: "Artikel" },
    });
    expect(manager.hasUnsavedChanges.value).toBe(true);
  });

  it("seeds every plural form with an empty string when the singular form is missing", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: false,
      translations: { en: {} },
    } satisfies TranslationData);
    await manager.loadTranslation("cart.items", "default");

    manager.togglePluralMode(true);

    expect(manager.translations.value.en).toEqual({ one: "", other: "" });
  });

  it("enables select mode with the default variable and options", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "Hello"));
    await manager.loadTranslation("greeting", "default");

    manager.toggleSelectMode("en", true);

    expect(manager.getSelectConfig("en")).toEqual({
      enabled: true,
      variable: "select",
      options: ["formal", "informal"],
    });
    expect(manager.translations.value.en).toEqual({ formal: "Hello", informal: "Hello" });
    expect(manager.hasUnsavedChanges.value).toBe(true);
  });

  it("seeds select forms with an empty string for a language with no translation", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "Hello"));
    await manager.loadTranslation("greeting", "default");

    manager.toggleSelectMode("de", true, { variable: "formality", options: ["formal"] });

    expect(manager.translations.value.de).toEqual({ formal: "" });
  });

  it("converts back to a singular value for a language that was never in select mode", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "Hello"));
    await manager.loadTranslation("greeting", "default");

    manager.toggleSelectMode("en", false);

    expect(manager.translations.value.en).toEqual({ other: "Hello" });
    expect(manager.getSelectConfig("en")).toBeUndefined();
  });

  it("falls back to an empty singular value when the language has no forms left", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "greeting",
      isPlural: false,
      translations: { en: {} },
    } satisfies TranslationData);
    await manager.loadTranslation("greeting", "default");

    manager.toggleSelectMode("en", false);

    expect(manager.translations.value.en).toEqual({ other: "" });
  });

  it("creates the select config store for data that has none", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "Hello"));
    await manager.loadTranslation("greeting", "default");

    manager.updateSelectConfig("en", { variable: "tone" });

    expect(manager.getSelectConfig("en")).toEqual({
      enabled: false,
      variable: "tone",
      options: [],
    });
    expect(manager.hasUnsavedChanges.value).toBe(true);
  });

  it("keeps form values that are not options when the option list is unchanged", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "Hello"));
    await manager.loadTranslation("greeting", "default");
    manager.toggleSelectMode("en", true, {
      variable: "formality",
      options: ["formal", "informal"],
    });
    manager.updateTranslation("en", "draft", "Draft");

    manager.updateSelectConfig("en", { options: ["formal", "informal"] });

    expect(manager.translations.value.en).toEqual({
      formal: "Hello",
      informal: "Hello",
      draft: "Draft",
    });
  });

  it("rebuilds the forms when one option is replaced by two shorter ones", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "Hello"));
    await manager.loadTranslation("greeting", "default");
    manager.toggleSelectMode("en", true, { variable: "tone", options: ["ab"] });

    manager.updateSelectConfig("en", { options: ["a", "b"] });

    expect(manager.translations.value.en).toEqual({ a: "Hello", b: "Hello" });
  });

  it("fills new options with an empty string when the language has no forms", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "greeting",
      isPlural: false,
      translations: { en: {} },
    } satisfies TranslationData);
    await manager.loadTranslation("greeting", "default");

    manager.updateSelectConfig("en", { options: ["formal", "informal"] });

    expect(manager.translations.value.en).toEqual({ formal: "", informal: "" });
  });

  it("requires a plural variable when the loaded data has none", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue({
      key: "cart.items",
      isPlural: true,
      translations: { en: { one: "Item", other: "Items" } },
    } satisfies TranslationData);
    await manager.loadTranslation("cart.items", "default");

    expect(manager.validate()).toEqual({
      isValid: false,
      errors: [{ languageId: "", pluralForm: "", message: "Plural variable name is required" }],
    });
  });

  it("flags unsaved changes after the plural variable is changed", async () => {
    const manager = await loadedPluralManager();

    manager.updatePluralVariable("n");

    expect(manager.pluralVariable.value).toBe("n");
    expect(manager.hasUnsavedChanges.value).toBe(true);
  });

  it("has no select config for a language until select mode is configured", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("greeting", "Hello"));

    await manager.loadTranslation("greeting", "default");

    expect(manager.getSelectConfig("en")).toBeUndefined();
  });
});
