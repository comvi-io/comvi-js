/**
 * The comparison key for a locale code: the platform matches `pt_br`, `PT-BR`
 * and `pt-BR` to one locale, so the CLI must too.
 */
export function localeKey(code: string): string {
  // The platform's normalizeLocaleCode: subtags split on - or _, empty ones dropped.
  const trimmed = code.trim();
  const subtags = trimmed.split(/[-_]/).filter((subtag) => subtag.length > 0);
  return (subtags.length > 0 ? subtags.join("-") : trimmed).toLowerCase();
}

/** The project's spelling of `code`, or undefined when the project lacks it. */
export function findLocale(code: string, known: readonly string[]): string | undefined {
  const key = localeKey(code);
  return known.find((candidate) => localeKey(candidate) === key);
}

export interface LocaleResolution {
  /** Local spelling → project spelling, for every local locale the project has. */
  spelling: Map<string, string>;
  /** Local locales the project does not have (or the key may not write). */
  unknown: string[];
  /** Project locales that more than one local spelling maps to. */
  duplicates: Array<{ locale: string; spellings: string[] }>;
}

export function resolveLocales(
  local: readonly string[],
  project: readonly string[],
): LocaleResolution {
  const spelling = new Map<string, string>();
  const unknown: string[] = [];
  const byKey = new Map<string, string[]>();

  for (const code of local) {
    byKey.set(localeKey(code), [...(byKey.get(localeKey(code)) ?? []), code]);
    const match = findLocale(code, project);
    if (match === undefined) {
      unknown.push(code);
      continue;
    }
    spelling.set(code, match);
  }

  // Judged on the local files alone: fr_FR and fr-FR clash whether or not the
  // project has the locale.
  const duplicates = [...byKey.values()]
    .filter((spellings) => spellings.length > 1)
    .map((spellings) => ({
      locale: findLocale(spellings[0], project) ?? spellings[spellings.length - 1],
      spellings,
    }));

  return { spelling, unknown, duplicates };
}
