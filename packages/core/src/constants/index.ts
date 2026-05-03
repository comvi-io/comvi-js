/** Symbol to mark errors already reported; reportError deduplicates when same error is rethrown from any source */
export const COMVI_REPORTED = Symbol.for("comvi.error.reported");

export const DEFAULT_NS = "default";
