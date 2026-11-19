import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(() => import("./helpers/useTranslationsMocks"));
vi.mock("../src/services/translationService", mocks.mockTranslationServiceModule);
vi.mock("../src/Core", mocks.mockCoreI18nLookupModule);

import { DEFAULT_PLURAL_VARIABLE } from "../src/utils/icuParser";
import type { TranslationData } from "../src/types";
import {
  createManager,
  createSingularTranslationData,
  loadedPluralManager,
  loadedSelectManager,
} from "./helpers/useTranslations";

const { getTranslationMock } = mocks;

describe("useTranslations — plural and select modes", () => {
  beforeEach(() => {
    mocks.resetUseTranslationsMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plural mode switched on for a singular key → the value is copied into one and other under the default variable", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("items.count", "Item"));
    await manager.loadTranslation("items.count", "default");

    manager.togglePluralMode(true);

    expect({
      isPlural: manager.state.value.data?.isPlural,
      pluralVariable: manager.state.value.data?.pluralVariable,
      one: manager.state.value.data?.translations.en?.one,
      other: manager.state.value.data?.translations.en?.other,
    }).toEqual({
      isPlural: true,
      pluralVariable: DEFAULT_PLURAL_VARIABLE,
      one: "Item",
      other: "Item",
    });
  });

  it("plural mode switched off again → the key is singular with only its other form", async () => {
    const manager = await loadedPluralManager();

    manager.togglePluralMode(false);

    expect({
      isPlural: manager.state.value.data?.isPlural,
      en: manager.state.value.data?.translations.en,
    }).toEqual({ isPlural: false, en: { other: "Item" } });
  });

  it("select mode switched on with two options → the config is stored and each option gets the singular value", async () => {
    const manager = createManager();
    getTranslationMock.mockResolvedValue(createSingularTranslationData("welcome.message", "Hello"));
    await manager.loadTranslation("welcome.message", "default");

    manager.toggleSelectMode("en", true, {
      variable: "formality",
      options: ["formal", "informal"],
    });

    expect({
      config: manager.state.value.data?.selectConfigs?.en,
      en: manager.state.value.data?.translations.en,
    }).toEqual({
      config: { enabled: true, variable: "formality", options: ["formal", "informal"] },
      en: { formal: "Hello", informal: "Hello" },
    });
  });

  it("select option added through updateSelectConfig → the new option gets the existing value", async () => {
    const manager = await loadedSelectManager();

    manager.updateSelectConfig("en", { options: ["formal", "neutral", "informal"] });

    expect(manager.state.value.data?.translations.en).toEqual({
      formal: "Hello",
      neutral: "Hello",
      informal: "Hello",
    });
  });

  it("select mode switched off again → the config is disabled and only the other form remains", async () => {
    const manager = await loadedSelectManager();

    manager.toggleSelectMode("en", false);

    expect({
      enabled: manager.state.value.data?.selectConfigs?.en?.enabled,
      en: manager.state.value.data?.translations.en,
    }).toEqual({ enabled: false, en: { other: "Hello" } });
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
      warnings: [],
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
