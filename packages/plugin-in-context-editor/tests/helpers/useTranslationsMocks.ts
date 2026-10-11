/**
 * Doubles for the two collaborators of `useTranslations`: the translation
 * service (the HTTP boundary) and the Core's i18n-instance lookup (the
 * runtime cache it updates after a save). Imports nothing from `src/`, so it
 * can be loaded through `vi.hoisted` before the mocks are registered:
 *
 *     const mocks = await vi.hoisted(() => import("./helpers/useTranslationsMocks"));
 *     vi.mock("../src/services/translationService", mocks.mockTranslationServiceModule);
 *     vi.mock("../src/Core", mocks.mockCoreI18nLookupModule);
 */
import { vi } from "vitest";

export const getTranslationMock = vi.fn();
export const saveTranslationMock = vi.fn();
export const getI18nInstanceMock = vi.fn();
export const addMessagesMock = vi.fn();

export function mockTranslationServiceModule() {
  return {
    getTranslation: (...args: unknown[]) => getTranslationMock(...args),
    saveTranslation: (...args: unknown[]) => saveTranslationMock(...args),
  };
}

export function mockCoreI18nLookupModule() {
  return {
    getI18nInstance: (...args: unknown[]) => getI18nInstanceMock(...args),
  };
}

/** Clears every double; the runtime lookup answers with an i18n that records `addMessages`. */
export function resetUseTranslationsMocks(): void {
  getTranslationMock.mockReset();
  saveTranslationMock.mockReset();
  getI18nInstanceMock.mockReset();
  addMessagesMock.mockReset();
  getI18nInstanceMock.mockReturnValue({ addMessages: addMessagesMock });
}
