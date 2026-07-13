export const LANGUAGE_SELECTION_STORAGE_KEY = "i18n-editor-selected-languages";

interface LanguageCode {
  code: string;
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

const allCodes = (languages: LanguageCode[]): string[] =>
  languages.map((language) => language.code);

export function restoreSelectedLanguages(
  availableLanguages: LanguageCode[],
  storage?: StorageReader,
): string[] {
  const fallback = allCodes(availableLanguages);

  try {
    const stored = (storage ?? globalThis.localStorage).getItem(LANGUAGE_SELECTION_STORAGE_KEY);
    if (!stored) return fallback;

    const storedCodes: unknown = JSON.parse(stored);
    if (!Array.isArray(storedCodes)) return fallback;

    const validCodes = storedCodes.filter(
      (code): code is string =>
        typeof code === "string" && availableLanguages.some((language) => language.code === code),
    );
    return validCodes.length > 0 ? validCodes : fallback;
  } catch {
    return fallback;
  }
}

export function persistSelectedLanguages(codes: string[], storage?: StorageWriter): void {
  try {
    (storage ?? globalThis.localStorage).setItem(
      LANGUAGE_SELECTION_STORAGE_KEY,
      JSON.stringify(codes),
    );
  } catch {
    // Storage can be unavailable in sandboxed frames and private browsing.
  }
}
