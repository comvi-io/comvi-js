/**
 * Fixtures for the useTranslations suites: the language list the manager is
 * built over, and managers already holding a loaded key in a given mode.
 */
import { ref } from "vue";
import { useTranslations } from "../../src/composables/useTranslations";
import type { Language, TranslationData } from "../../src/types";
import { getTranslationMock } from "./useTranslationsMocks";

export const LANGUAGES: Language[] = [
  {
    id: 1,
    code: "en",
    name: "English",
    nativeName: "English",
    pluralForms: ["one", "other"],
    isSource: true,
  },
];

export const RUSSIAN: Language = {
  id: 2,
  code: "ru",
  name: "Russian",
  nativeName: "Russkiy",
  pluralForms: ["one", "few", "many", "other"],
  isSource: false,
};

export function createManager(instanceId?: string) {
  return useTranslations(ref(LANGUAGES), instanceId ? ref(instanceId) : undefined);
}

export type TranslationManager = ReturnType<typeof createManager>;

export function createSingularTranslationData(key: string, value: string): TranslationData {
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
export async function loadedPluralManager(): Promise<TranslationManager> {
  const manager = createManager();
  getTranslationMock.mockResolvedValue(createSingularTranslationData("items.count", "Item"));
  await manager.loadTranslation("items.count", "default");
  manager.togglePluralMode(true);
  return manager;
}

/** A manager holding a loaded singular key, already switched to select mode on two options. */
export async function loadedSelectManager(): Promise<TranslationManager> {
  const manager = createManager();
  getTranslationMock.mockResolvedValue(createSingularTranslationData("welcome.message", "Hello"));
  await manager.loadTranslation("welcome.message", "default");
  manager.toggleSelectMode("en", true, { variable: "formality", options: ["formal", "informal"] });
  return manager;
}

/**
 * Two loads whose responses the test settles by hand: the first one can be
 * rejected, the second one resolved.
 */
export function twoRacingLoads() {
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
  return {
    rejectFirst: (reason: unknown) => rejectFirst(reason),
    resolveSecond: (value: TranslationData) => resolveSecond(value),
  };
}
