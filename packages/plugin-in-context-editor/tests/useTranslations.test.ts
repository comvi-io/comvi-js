import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useTranslations } from "../src/composables/useTranslations";
import { DEFAULT_PLURAL_VARIABLE, MAX_PLURAL_VARIABLE_LENGTH } from "../src/utils/icuParser";
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

function createManager(instanceId?: string) {
  return useTranslations(ref(LANGUAGES), instanceId ? ref(instanceId) : undefined);
}

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

  it("supports select mode conversion and option reconfiguration", async () => {
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

  it("validates plural variable requirements", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("items.count", "Item"));
    await manager.loadTranslation("items.count", "default");
    manager.togglePluralMode(true);

    manager.updatePluralVariable("");
    expect(manager.validate().errors.map((e) => e.message)).toContain(
      "Plural variable name is required",
    );

    manager.updatePluralVariable("1count");
    expect(manager.validate().errors.map((e) => e.message)).toContain(
      "Plural variable name must be a valid identifier",
    );

    manager.updatePluralVariable("a".repeat(MAX_PLURAL_VARIABLE_LENGTH + 1));
    expect(manager.validate().errors.map((e) => e.message)).toContain(
      `Plural variable name must be ${MAX_PLURAL_VARIABLE_LENGTH} characters or less`,
    );

    manager.updatePluralVariable("count");
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
    const runtimePayload = addTranslationsMock.mock.calls[0]?.[0] as Record<
      string,
      Record<string, string>
    >;
    expect(runtimePayload["en:default"]?.["inbox.messages"]).toContain("{formality, select,");
    expect(runtimePayload["en:default"]?.["inbox.messages"]).toContain("{count, plural,");
  });

  it("handles save errors and missing i18n runtime safely", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("home.title", "Initial"));
    await manager.loadTranslation("home.title", "default");

    saveTranslationMock.mockRejectedValueOnce(new Error("Save failed"));
    const failedSave = await manager.saveTranslation();
    expect(failedSave).toBeNull();
    expect(manager.state.value.error).toBe("Save failed");

    getI18nInstanceMock.mockReturnValueOnce(null);
    saveTranslationMock.mockResolvedValueOnce(
      createSingularTranslationData("home.title", "Updated"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const successfulSave = await manager.saveTranslation();

    expect(successfulSave).not.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[InContextEditor] Cannot update runtime cache: i18n instance not available",
    );
  });

  it("warns when update methods are called without loaded data", () => {
    const manager = createManager();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    manager.updateTranslation("en", "other", "Hello");
    manager.updateMetadata({ context: "ctx" });
    manager.updatePluralVariable("count");
    manager.togglePluralMode(true);
    manager.toggleSelectMode("en", true);
    manager.updateSelectConfig("en", { enabled: true });

    expect(warnSpy).toHaveBeenCalledTimes(6);
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
});
