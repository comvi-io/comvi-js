/**
 * Activation facts shared by the popup and the service worker.
 *
 * Kept apart from validation.ts on purpose: that module belongs to the bridge
 * content script, which must stay one self-contained file. A module imported
 * by the bridge AND by an extension page would be split into a shared chunk,
 * and a content script cannot import one.
 */

import type { ActivationFailureCode, StatusResponsePayload } from "./messages";

const ACTIVATION_FAILURE_CODES: readonly ActivationFailureCode[] = [
  "csp-blocked",
  "load-error",
  "timeout",
  "no-global",
  "no-loader",
];

/** A failure code from the fixed list, or nothing. */
export function asActivationFailureCode(value: unknown): ActivationFailureCode | undefined {
  return ACTIVATION_FAILURE_CODES.find((code) => code === value);
}

// Three numbers, then an optional pre-release or build suffix; 32 characters
// at most. No whitespace can pass, so a version cannot carry a sentence.
const DISPLAY_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;

/**
 * A page-reported version the popup may show, or nothing. The SDK and editor
 * versions are the only page-authored strings the popup ever renders, so they
 * must look like a version and nothing else.
 */
export function asDisplayVersion(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 32 && DISPLAY_VERSION.test(value)
    ? value
    : undefined;
}

/**
 * Whether the page can supply the editor: it is already loaded, or a loader
 * hook is there to load it. `undefined` when the status does not say.
 */
export function editorAvailability(
  status: Pick<StatusResponsePayload, "editorLoaded" | "editorLoader">,
): boolean | undefined {
  const loader = status.editorLoader;
  if (status.editorLoaded === true || (typeof loader === "object" && loader !== null)) return true;
  return loader === null ? false : undefined;
}
