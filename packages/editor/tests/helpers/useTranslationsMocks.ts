/**
 * Doubles for the two collaborators of `useTranslations`: the translation
 * service (the HTTP boundary) and the Core's session lookup (the
 * runtime cache it updates after a save). Imports nothing from `src/`, so it
 * can be loaded through `vi.hoisted` before the mocks are registered:
 *
 *     const mocks = await vi.hoisted(() => import("./helpers/useTranslationsMocks"));
 *     vi.mock("../src/services/translationService", mocks.mockTranslationServiceModule);
 *     vi.mock("../src/Core", mocks.mockCoreI18nLookupModule);
 */
import { vi } from "vitest";
import { sessionWritingTo } from "./sessionDouble";

export const getTranslationMock = vi.fn();
export const saveTranslationMock = vi.fn();
export const getSessionMock = vi.fn();
export const addMessagesMock = vi.fn();

export function mockTranslationServiceModule() {
  return {
    getTranslation: (...args: unknown[]) => getTranslationMock(...args),
    saveTranslation: (...args: unknown[]) => saveTranslationMock(...args),
  };
}

export function mockCoreI18nLookupModule() {
  return {
    getSession: (...args: unknown[]) => getSessionMock(...args),
  };
}

/** Clears every double; the session lookup answers with a session that records the patch. */
export function resetUseTranslationsMocks(): void {
  getTranslationMock.mockReset();
  saveTranslationMock.mockReset();
  getSessionMock.mockReset();
  addMessagesMock.mockReset();
  getSessionMock.mockReturnValue(sessionWritingTo(addMessagesMock));
}
