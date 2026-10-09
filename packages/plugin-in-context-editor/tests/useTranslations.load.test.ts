import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(() => import("./helpers/useTranslationsMocks"));
vi.mock("../src/services/translationService", mocks.mockTranslationServiceModule);
vi.mock("../src/Core", mocks.mockCoreI18nLookupModule);

import type { TranslationData } from "../src/types";
import {
  createManager,
  createSingularTranslationData,
  twoRacingLoads,
  type TranslationManager,
} from "./helpers/useTranslations";

const { getTranslationMock } = mocks;

describe("useTranslations — loading a key", () => {
  beforeEach(() => {
    mocks.resetUseTranslationsMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("stores normalized load error state when translation fetch fails", async () => {
    const manager = createManager();
    getTranslationMock.mockRejectedValueOnce(new Error("Load failed"));

    await manager.loadTranslation("home.title", "default");

    expect(manager.state.value.error).toBe("Load failed");
    expect(manager.state.value.isLoading).toBe(false);
  });

  it("a load fails after an earlier one succeeded → the stale data is cleared, the error shown, nothing dirty", async () => {
    const manager = createManager();
    getTranslationMock
      .mockResolvedValueOnce(createSingularTranslationData("home.title", "Welcome"))
      .mockRejectedValueOnce(new Error("Load failed"));
    await manager.loadTranslation("home.title", "default");

    await manager.loadTranslation("missing.key", "default");

    expect({
      data: manager.state.value.data,
      error: manager.state.value.error,
      isDirty: manager.state.value.isDirty,
    }).toEqual({ data: null, error: "Load failed", isDirty: false });
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

  it("fresh manager → the state is empty, not loading, without error, not dirty", () => {
    const manager = createManager();

    expect(manager.state.value).toEqual({
      data: null,
      isLoading: false,
      error: null,
      isDirty: false,
    });
  });

  it.each<[string, (manager: TranslationManager) => unknown, unknown]>([
    ["currentKey", (m) => m.currentKey.value, undefined],
    ["description", (m) => m.description.value, ""],
    ["translations", (m) => m.translations.value, {}],
    ["hasUnsavedChanges", (m) => m.hasUnsavedChanges.value, false],
    ["isPlural", (m) => m.isPlural.value, false],
    ["pluralVariable", (m) => m.pluralVariable.value, ""],
    ["selectConfigs", (m) => m.selectConfigs.value, {}],
    ['getSelectConfig("en")', (m) => m.getSelectConfig("en"), undefined],
  ])("fresh manager → %s reads its empty default", (_name, read, expected) => {
    const manager = createManager();

    const value = read(manager);

    expect(value).toEqual(expected);
  });

  it.each<[string, (manager: TranslationManager) => unknown, unknown]>([
    ["currentKey", (m) => m.currentKey.value, "cart.items"],
    ["translations", (m) => m.translations.value, { en: { one: "# item", other: "# items" } }],
    ["isPlural", (m) => m.isPlural.value, true],
    ["pluralVariable", (m) => m.pluralVariable.value, "n"],
    [
      "selectConfigs",
      (m) => m.selectConfigs.value,
      { en: { enabled: true, variable: "formality", options: ["formal", "informal"] } },
    ],
    ["hasUnsavedChanges", (m) => m.hasUnsavedChanges.value, false],
    [
      'getSelectConfig("en")',
      (m) => m.getSelectConfig("en"),
      { enabled: true, variable: "formality", options: ["formal", "informal"] },
    ],
  ])("plural key with a select config loaded → %s exposes it", async (_name, read, expected) => {
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

    expect(read(manager)).toEqual(expected);
  });

  it("fetch in flight → isLoading is true", () => {
    const manager = createManager();
    getTranslationMock.mockImplementation(() => new Promise<TranslationData>(() => undefined));

    void manager.loadTranslation("home.title", "default");

    expect(manager.state.value.isLoading).toBe(true);
  });

  it("fetch settles → isLoading is false again", async () => {
    const manager = createManager();
    let resolveLoad!: (value: TranslationData) => void;
    getTranslationMock.mockImplementation(
      () =>
        new Promise<TranslationData>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const pending = manager.loadTranslation("home.title", "default");

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
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      "[@comvi/plugin-in-context-editor] Error loading translation:",
      "network down",
    );
  });

  it("older request rejects while a newer one is still loading → no error, still loading, nothing logged", async () => {
    const manager = createManager();
    const { rejectFirst } = twoRacingLoads();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const firstLoad = manager.loadTranslation("key.first", "default");
    void manager.loadTranslation("key.second", "default");

    rejectFirst(new Error("Load failed"));
    await firstLoad;

    expect({
      error: manager.state.value.error,
      isLoading: manager.state.value.isLoading,
      logged: errorSpy.mock.calls.length,
    }).toEqual({ error: null, isLoading: true, logged: 0 });
  });

  it("older request rejected, then the newer one resolves → the newer key's data is shown", async () => {
    const manager = createManager();
    const { rejectFirst, resolveSecond } = twoRacingLoads();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const firstLoad = manager.loadTranslation("key.first", "default");
    const secondLoad = manager.loadTranslation("key.second", "default");
    rejectFirst(new Error("Load failed"));
    await firstLoad;

    resolveSecond(createSingularTranslationData("key.second", "Second"));
    await secondLoad;

    expect(manager.state.value.data?.key).toBe("key.second");
  });
});
