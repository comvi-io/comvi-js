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
  const raw = value as Record<string, unknown>;
  if (typeof raw.protocol !== "number" || !Number.isInteger(raw.protocol) || raw.protocol < 1) {
    return null;
  }
  return {
    protocol: raw.protocol,
    sdkVersion: asOptionalString(raw.sdkVersion, 64),
    editorVersion: asOptionalString(raw.editorVersion, 64),
  };
}

/** Coerce an untrusted detector status payload into a fixed shape. */
export function sanitizeStatus(detail: unknown): StatusResponsePayload {
  const raw = parseEventDetail(detail);
  return {
    comviDetected: asBoolean(raw.detected) || asBoolean(raw.comviDetected),
    editorActive: asBoolean(raw.editorActive),
    editorLoaded: asBoolean(raw.editorLoaded),
    editorLoader: asEditorLoader(raw.editorLoader),
    editorVersion: asOptionalString(raw.editorVersion, 64),
    version: asOptionalString(raw.version, 64),
    instanceCount: asCount(raw.instanceCount),
  };
}

/** Coerce an untrusted activation/deactivation result into a fixed shape. */
export function sanitizeActivationResult(detail: unknown): EditorActivatedPayload {
  const raw = parseEventDetail(detail);
  return {
    success: asBoolean(raw.success),
    error: asOptionalString(raw.error, 512),
    // Type and length only: the service worker holds the list of known codes
    // and drops any other before the popup sees it.
    code: asOptionalString(raw.code, 32),
    host: asOptionalString(raw.host, 64),
    instanceId: asOptionalString(raw.instanceId, 128),
    collectContext: asBoolean(raw.collectContext),
  };
}
