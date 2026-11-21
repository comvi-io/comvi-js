/**
 * Client-local mirror of `inferTargetType`.
 *
 * This is a PURE function of the key name plus already-derived signals — no
 * rendered text, no server data. The platform ports its own authoritative
 * copy server-side to build the stored `contextProfile`;
 * this client-side copy exists ONLY so the collector's local resend gate can
 * compute an `observationHash` comparable in shape to the server's. Keep the
 * two in sync manually — this is not the cross-repo hash-fold coordination
 * point (that is `HASH_FN_VERSION` + `computeObservationHash` in ./hash.ts).
 */

import type { ConstraintSignals, SemanticSignals, TranslationRole, UiType } from "./types";

const DESTRUCTIVE_PATTERN = /delete|remove|clear|reset|destroy|discard|revoke/i;
const PRIMARY_PATTERN = /submit|confirm|save|apply|continue|proceed|checkout|pay|send|create|add/i;
const SECONDARY_PATTERN = /cancel|back|close|dismiss|skip|later|no[_-]?thanks/i;

export function inferTargetType(
  keyName: string,
  semantic: SemanticSignals,
  constraints: ConstraintSignals,
): { uiType: UiType; translationRole: TranslationRole } {
  const key = keyName.toLowerCase();
  const role = semantic.semanticRole;

  if (role === "button" || semantic.htmlType === "submit" || semantic.ariaRole === "button") {
    if (DESTRUCTIVE_PATTERN.test(key)) {
      return { uiType: "destructive-button", translationRole: "imperative-verb" };
    }
    if (PRIMARY_PATTERN.test(key)) {
      return { uiType: "primary-button", translationRole: "imperative-verb" };
    }
    if (SECONDARY_PATTERN.test(key)) {
      return { uiType: "secondary-button", translationRole: "imperative-verb" };
    }
    return { uiType: "primary-button", translationRole: "imperative-verb" };
  }

  if (role === "heading") {
    const isPageTitle = constraints.soft.visualProminence === "high";
    return {
      uiType: isPageTitle ? "page-title" : "section-title",
      translationRole: "noun-phrase",
    };
  }

  if (role === "label") {
    return { uiType: "form-label", translationRole: "field-label" };
  }
  if (role === "input") {
    if (key.includes("placeholder")) {
      return { uiType: "form-placeholder", translationRole: "placeholder-hint" };
    }
    return { uiType: "form-label", translationRole: "field-label" };
  }

  if (role === "alert") {
    return { uiType: "error-message", translationRole: "error-sentence" };
  }

  if (role === "menu-item" || role === "link") {
    return { uiType: "nav-item", translationRole: "nav-label" };
  }

  if (constraints.hard.widthBucket === "tiny" || constraints.hard.widthBucket === "small") {
    if (role === "caption" || role === "body-text") {
      return { uiType: "status-badge", translationRole: "short-status" };
    }
  }

  return { uiType: "body-text", translationRole: "descriptive-text" };
}
