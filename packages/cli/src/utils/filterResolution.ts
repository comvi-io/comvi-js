/**
 * Helpers for resolving namespace/language filters in pull/push.
 *
 * Resolution rule: CLI flag fully overrides .comvirc.json (no merge).
 * If neither is set the command operates on the project's full set
 * (the API returns everything when no query params are given).
 */

import { ErrorCodes, TypegenError } from "./errors";

export type FilterSource = "cli" | "config" | "all";

export interface FilterResolution {
  /** Final list to send to the API; undefined means "all". */
  value: string[] | undefined;
  /** Where the value came from. Used for explicit logging in CI. */
  source: FilterSource;
}

/**
 * Parse a CLI list flag (`--ns a,b,c`).
 *
 * Returns `undefined` for `undefined`, non-string values, and lists that contain
 * only blank items — so the caller cannot accidentally send `[""]` to the API.
 */
export function parseListFlag(value: unknown): string[] | undefined {
  if (typeof value !== "string") return undefined;
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  return items.length > 0 ? items : undefined;
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

  const returnedSet = new Set(returned);
  const missing = requested.filter((item) => !returnedSet.has(item));
  if (missing.length === 0) return;

  throw new TypegenError(
    `Unknown ${fieldName}: ${missing.join(", ")}. ` +
      `Available in project: ${returned.join(", ") || "(none)"}.`,
    ErrorCodes.VALIDATION_FAILED,
  );
}
