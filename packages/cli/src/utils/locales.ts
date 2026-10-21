/**
 * The comparison key for a locale code: the platform matches `pt_br`, `PT-BR`
 * and `pt-BR` to one locale, so the CLI must too.
 */
export function localeKey(code: string): string {
  return code.trim().replace(/_/g, "-").toLowerCase();
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
  const byProject = new Map<string, string[]>();

  for (const code of local) {
    const match = findLocale(code, project);
    if (match === undefined) {
      unknown.push(code);
      continue;
    }
    spelling.set(code, match);
    byProject.set(match, [...(byProject.get(match) ?? []), code]);
  }

  const duplicates = [...byProject]
    .filter(([, spellings]) => spellings.length > 1)
    .map(([locale, spellings]) => ({ locale, spellings }));

  return { spelling, unknown, duplicates };
}
