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
  "invalid-editor-version",
  "no-loader",
];

/** A failure code from the fixed list, or nothing. */
export function asActivationFailureCode(value: unknown): ActivationFailureCode | undefined {
  return ACTIVATION_FAILURE_CODES.find((code) => code === value);
}

// Three numbers, then at most one lowercase pre-release word and one number:
// `0.6.0`, `0.6.0-rc.1` (the only pre-release this repository publishes,
// scripts/rc-version.mjs), `0.6.0-next.20261011`. No build metadata and no
// second dotted word, so nothing that reads as a host name or a message.
const DISPLAY_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-z]{1,8}(?:\.\d{1,10})?)?$/;

/**
 * A page-reported version the popup may show, or nothing. The SDK and editor
 * versions are the only page-authored strings the popup ever renders, so they
 * must look like a version and nothing else. One that does not is not shown.
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
