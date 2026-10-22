/**
 * Helpers for resolving namespace/language filters in pull/push.
 *
 * Resolution rule: CLI flag fully overrides .comvirc.json (no merge).
 * If neither is set the command operates on the project's full set
 * (the API returns everything when no query params are given).
 */

import { ErrorCodes, TypegenError } from "./errors";
import { findLocale, localeKey } from "./locales";

export type FilterSource = "cli" | "config" | "all";

export interface FilterResolution {
  /** Final list to send to the API; undefined means "all". */
  value: string[] | undefined;
  /** Where the value came from. Used for explicit logging in CI. */
  source: FilterSource;
}

/**
 * Parse a CLI list flag (`--ns a,b,c`). A flag that is absent is `undefined`;
 * a flag given with nothing in it (`--locale "$UNSET"`) is refused, because
 * reading it as "all" would make `--empty-dir` clear the whole catalog.
 */
export function parseListFlag(value: unknown, flag = "filter"): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  if (items.length === 0) {
    throw new TypegenError(
      `${flag} was given an empty value; remove the flag to use every item`,
      ErrorCodes.VALIDATION_FAILED,
    );
  }
  return items;
}

/**
 * Resolve a filter using "CLI > config > all".
 */
export function resolveFilter(
  cliValue: string[] | undefined,
  configValue: string[] | undefined,
): FilterResolution {
  if (cliValue !== undefined) return { value: cliValue, source: "cli" };
  if (configValue !== undefined) return { value: configValue, source: "config" };
  return { value: undefined, source: "all" };
}

/**
 * Compare what the user asked for against what the server returned and throw
 * if anything is missing. Centralizes the "fail loud on typos" behavior so
 * pull surfaces config typos as exit-code-4 errors instead of silently
 * producing empty translation files in CI.
 */
export function assertAllReturned(
  fieldName: "namespaces" | "locales",
  requested: string[] | undefined,
  returned: string[],
): void {
  if (!requested?.length) return;

  // Locale codes are matched as the platform matches them: `pt_br` is `pt-BR`.
  const key = fieldName === "locales" ? localeKey : (item: string) => item;
  const returnedSet = new Set(returned.map(key));
  const missing = requested.filter((item) => !returnedSet.has(key(item)));
  if (missing.length === 0) return;

  throw new TypegenError(
    `Unknown ${fieldName}: ${missing.join(", ")}. ` +
      // A restricted key sees fewer locales than the project has.
      `Available ${fieldName === "locales" ? "with this API key" : "in project"}: ${returned.join(", ") || "(none)"}.`,
    ErrorCodes.VALIDATION_FAILED,
  );
}

/**
 * A requested locale the project has but the response carries no data for:
 * the key's owner is restricted away from it. Reported before the generic
 * "unknown" check, which would call it a typo.
 */
export function assertReadable(
  requested: string[] | undefined,
  projectLocales: string[],
  returnedLocales: string[],
): void {
  const unreadable = (requested ?? []).filter(
    (locale) =>
      findLocale(locale, projectLocales) !== undefined &&
      findLocale(locale, returnedLocales) === undefined,
  );
  if (unreadable.length === 0) return;

  throw new TypegenError(
    `Locales not readable with this API key: ${unreadable.join(", ")}. ` +
      "The key's owner may be restricted to other languages.",
    ErrorCodes.API_AUTH_FAILED,
  );
}
