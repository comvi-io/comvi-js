/**
 * Typed contract for the in-context editor mappings bridge —
 * `@comvi/core/editor-bridge`.
 *
 * The editor plugin (`@comvi/plugin-in-context-editor`) exposes a small
 * key-mapping bridge on the i18n instance so framework adapters (Nuxt/Next)
 * can transfer SSR key mappings to the client before hydration. Both sides
 * previously hand-copied the property keys, the bridge shape, and the
 * `toRecordOfNumbers` validator; this module is the single canonical home.
 *
 * PURE module: types + constants + two small helpers, no side effects.
 * It intentionally stays OUT of the package.json `sideEffects` array.
 */

/**
 * Host property under which the editor plugin exposes the mappings bridge
 * (written by the editor plugin, read by SSR framework adapters).
 */
export const EDITOR_MAPPINGS_GLOBAL = "__comviInContextEditorMappings" as const;

/**
 * Host property under which SSR framework adapters hand the server-rendered
 * key mappings to the editor plugin before hydration (written by the adapter,
 * consumed once by the editor plugin).
 */
export const EDITOR_INITIAL_MAPPINGS_GLOBAL = "__comviInContextEditorInitialMappings" as const;

/**
 * The mappings bridge the editor plugin attaches under
 * {@link EDITOR_MAPPINGS_GLOBAL}.
 */
export interface InContextEditorMappings {
  /** Snapshot of the current key → id map (e.g. for the SSR payload). */
  getKeyMappings: () => Record<string, number>;
  /** Restore a previously captured key → id map (client hydration). */
  loadKeyMappings: (mappings: Record<string, number>) => void;
}

/**
 * Validate an untrusted value (SSR payload state, host property) as a
 * key → finite-number record. Returns `undefined` when any entry fails.
 */
export function toRecordOfNumbers(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, number> = {};
  for (const [key, item] of entries) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return undefined;
    }
    result[key] = item;
  }
  return result;
}

/**
 * Read a well-formed mappings bridge from a host object (the i18n instance,
 * or any object the editor plugin attached it to). Returns `undefined` when
 * the host carries no bridge or the bridge is malformed.
 */
export function readEditorMappings(host: unknown): InContextEditorMappings | undefined {
  if (!host || (typeof host !== "object" && typeof host !== "function")) {
    return undefined;
  }
  const bridge = (host as Record<string, unknown>)[EDITOR_MAPPINGS_GLOBAL];
  if (!bridge || typeof bridge !== "object") {
    return undefined;
  }
  const candidate = bridge as Partial<Record<keyof InContextEditorMappings, unknown>>;
  if (
    typeof candidate.getKeyMappings !== "function" ||
    typeof candidate.loadKeyMappings !== "function"
  ) {
    return undefined;
  }
  return bridge as InContextEditorMappings;
}
