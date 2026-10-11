/**
 * Sanitizers for untrusted event payloads.
 *
 * Everything arriving over DOM CustomEvents comes from the page's MAIN world
 * and can be forged or malformed by any page script. These helpers coerce
 * such input into fixed shapes so downstream code never sees surprising
 * types. Spoofed *status* is inherently possible on a hostile page (it can
 * fake "Comvi detected"), but with credentials confined to the service
 * worker a spoof yields UI noise, not secrets.
 */

import type { StatusResponsePayload, EditorActivatedPayload, EditorLoaderStatus } from "./messages";

/** Parse a CustomEvent detail that may be a JSON string or an object. Never throws. */
export function parseEventDetail(detail: unknown): Record<string, unknown> {
  if (typeof detail === "string") {
    try {
      const parsed = JSON.parse(detail) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
}

/**
 * Read one property of a page-authored object exactly ONCE, never throwing.
 * The object may be a Proxy or carry getters: a second read can return
 * something else than the value that was just validated, and any read can
 * throw. Callers validate the returned local and build their output from it.
 */
export function readField(source: unknown, key: string): unknown {
  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asOptionalString(value: unknown, maxLength = 256): string | undefined {
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function asEditorLoader(value: unknown): EditorLoaderStatus | null {
  if (!value || typeof value !== "object") return null;
  const protocol = readField(value, "protocol");
  if (typeof protocol !== "number" || !Number.isInteger(protocol) || protocol < 1) {
    return null;
  }
  return {
    protocol,
    sdkVersion: asOptionalString(readField(value, "sdkVersion"), 64),
    editorVersion: asOptionalString(readField(value, "editorVersion"), 64),
  };
}

/** Coerce an untrusted detector status payload into a fixed shape. */
export function sanitizeStatus(detail: unknown): StatusResponsePayload {
  const raw = parseEventDetail(detail);
  return {
    // Both names are read, each once: `||` would skip the second on a hit.
    comviDetected: [readField(raw, "detected"), readField(raw, "comviDetected")].some(asBoolean),
    editorActive: asBoolean(readField(raw, "editorActive")),
    editorLoaded: asBoolean(readField(raw, "editorLoaded")),
    editorLoader: asEditorLoader(readField(raw, "editorLoader")),
    editorVersion: asOptionalString(readField(raw, "editorVersion"), 64),
    version: asOptionalString(readField(raw, "version"), 64),
    instanceCount: asCount(readField(raw, "instanceCount")),
  };
}

/** Coerce an untrusted activation/deactivation result into a fixed shape. */
export function sanitizeActivationResult(detail: unknown): EditorActivatedPayload {
  const raw = parseEventDetail(detail);
  return {
    success: asBoolean(readField(raw, "success")),
    // Type and length only: the service worker holds the list of known codes
    // and drops any other before the popup sees it.
    code: asOptionalString(readField(raw, "code"), 32),
    instanceId: asOptionalString(readField(raw, "instanceId"), 128),
    collectContext: asBoolean(readField(raw, "collectContext")),
  };
}
