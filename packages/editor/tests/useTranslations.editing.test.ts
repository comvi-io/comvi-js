import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(() => import("./helpers/useTranslationsMocks"));
vi.mock("../src/services/translationService", mocks.mockTranslationServiceModule);
vi.mock("../src/Core", mocks.mockCoreI18nLookupModule);

import type { TranslationData } from "../src/types";
import {
  createManager,
  createSingularTranslationData,
  type TranslationManager,
} from "./helpers/useTranslations";

const { getTranslationMock } = mocks;

describe("useTranslations — editing and unsaved changes", () => {
  beforeEach(() => {
    mocks.resetUseTranslationsMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "updateTranslation",
      (m: TranslationManager) => m.updateTranslation("en", "other", "Hello"),
      "[@comvi/plugin-in-context-editor] Cannot update translation: no data loaded",
    ],
    [
      "updateMetadata",
      (m: TranslationManager) => m.updateMetadata({ context: "ctx" }),
      "[@comvi/plugin-in-context-editor] Cannot update metadata: no data loaded",
    ],
    [
      "updatePluralVariable",
      (m: TranslationManager) => m.updatePluralVariable("count"),
      "[@comvi/plugin-in-context-editor] Cannot update plural variable: no data loaded",
    ],
    [
      "togglePluralMode",
      (m: TranslationManager) => m.togglePluralMode(true),
      "[@comvi/plugin-in-context-editor] Cannot toggle plural mode: no data loaded",
    ],
    [
      "toggleSelectMode",
      (m: TranslationManager) => m.toggleSelectMode("en", true),
      "[@comvi/plugin-in-context-editor] Cannot toggle select mode: no data loaded",
    ],
    [
      "updateSelectConfig",
      (m: TranslationManager) => m.updateSelectConfig("en", { enabled: true }),
      "[@comvi/plugin-in-context-editor] Cannot update select config: no data loaded",
    ],
  ])("warns when %s is called without loaded data", (_name, call, message) => {
    const manager = createManager();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    call(manager);

    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(message);
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
      "[@comvi/plugin-in-context-editor] Error loading translation:",
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
});
