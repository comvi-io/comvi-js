import { useState } from "#app";

const KEY = "i18n-locale";

export function useLocaleState(defaultValue?: string) {
  return useState<string>(KEY, () => defaultValue ?? "");
}
