import { describe, it, expect } from "vitest";
import { inferTargetType } from "../src/collector/targetType";
import type { ConstraintSignals, SemanticSignals } from "../src/collector/types";

function makeSemantic(overrides: Partial<SemanticSignals> = {}): SemanticSignals {
  return {
    semanticRole: "unknown",
    hasAriaLabel: false,
    hasPlaceholder: false,
    ancestry: [],
    ...overrides,
  };
}

function makeConstraints(
  hard: Partial<ConstraintSignals["hard"]> = {},
  soft: Partial<ConstraintSignals["soft"]> = {},
): ConstraintSignals {
  return {
    hard: { mustBeShort: false, singleLine: false, widthBucket: "medium", ...hard },
    soft: {
      likelyTruncated: false,
      visuallyCompact: false,
      visualProminence: "medium",
      ...soft,
    },
  };
}

describe("collector/targetType — inferTargetType branches", () => {
  it("classifies a destructive button by key name", () => {
    const result = inferTargetType(
      "account.deleteAccount",
      makeSemantic({ semanticRole: "button" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "destructive-button", translationRole: "imperative-verb" });
  });

  it("classifies a primary button by key name", () => {
    const result = inferTargetType(
      "checkout.submit",
      makeSemantic({ semanticRole: "button" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "primary-button", translationRole: "imperative-verb" });
  });

  it("classifies a secondary button by key name", () => {
    const result = inferTargetType(
      "modal.cancel",
      makeSemantic({ semanticRole: "button" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "secondary-button", translationRole: "imperative-verb" });
  });

  it("defaults an unrecognized button key name to primary-button", () => {
    const result = inferTargetType(
      "generic.action",
      makeSemantic({ semanticRole: "button" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "primary-button", translationRole: "imperative-verb" });
  });

  it.each([
    ["an html submit input", { htmlType: "submit" }],
    ["an aria role=button", { ariaRole: "button" }],
  ])("also recognizes %s as a button", (_label, marker) => {
    const result = inferTargetType(
      "form.go",
      makeSemantic({ semanticRole: "unknown", ...marker }),
      makeConstraints(),
    );

    expect(result).toEqual({ uiType: "primary-button", translationRole: "imperative-verb" });
  });

  it.each([
    ["high", "page-title"],
    ["medium", "section-title"],
  ] as const)("classifies a %s-prominence heading as %s", (visualProminence, uiType) => {
    const result = inferTargetType(
      "home.title",
      makeSemantic({ semanticRole: "heading" }),
      makeConstraints({}, { visualProminence }),
    );

    expect(result).toEqual({ uiType, translationRole: "noun-phrase" });
  });

  it("classifies a label role as form-label", () => {
    const result = inferTargetType(
      "auth.email.label",
      makeSemantic({ semanticRole: "label" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "form-label", translationRole: "field-label" });
  });

  it.each([
    ["auth.email.placeholder", "form-placeholder", "placeholder-hint"],
    ["auth.email.field", "form-label", "field-label"],
  ] as const)("classifies the input-role key %s as %s", (key, uiType, translationRole) => {
    const result = inferTargetType(key, makeSemantic({ semanticRole: "input" }), makeConstraints());

    expect(result).toEqual({ uiType, translationRole });
  });

  it("classifies an alert role as an error-message", () => {
    const result = inferTargetType(
      "auth.error",
      makeSemantic({ semanticRole: "alert" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "error-message", translationRole: "error-sentence" });
  });

  it.each(["menu-item", "link"] as const)("classifies the %s role as nav-item", (semanticRole) => {
    const result = inferTargetType(
      "nav.settings",
      makeSemantic({ semanticRole }),
      makeConstraints(),
    );

    expect(result).toEqual({ uiType: "nav-item", translationRole: "nav-label" });
  });

  it.each([
    ["caption", "tiny"],
    ["body-text", "small"],
  ] as const)(
    "classifies a %s in a %s width bucket as a status-badge",
    (semanticRole, widthBucket) => {
      const result = inferTargetType(
        "order.status",
        makeSemantic({ semanticRole }),
        makeConstraints({ widthBucket }),
      );

      expect(result).toEqual({ uiType: "status-badge", translationRole: "short-status" });
    },
  );

  it("does not classify a large caption as a status-badge", () => {
    const result = inferTargetType(
      "order.status",
      makeSemantic({ semanticRole: "caption" }),
      makeConstraints({ widthBucket: "full" }),
    );
    expect(result).toEqual({ uiType: "body-text", translationRole: "descriptive-text" });
  });

  it("falls back to body-text/descriptive-text for everything else", () => {
    const result = inferTargetType(
      "generic.paragraph",
      makeSemantic({ semanticRole: "body-text" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "body-text", translationRole: "descriptive-text" });
  });

  it("prefers the destructive pattern over the secondary one when a button key matches both", () => {
    const result = inferTargetType(
      "modal.cancel.delete",
      makeSemantic({ semanticRole: "button" }),
      makeConstraints(),
    );

    expect(result).toEqual({ uiType: "destructive-button", translationRole: "imperative-verb" });
  });

  it.each(["banner.nothanks", "banner.no_thanks", "banner.no-thanks"])(
    "classifies the button key %s as a secondary button",
    (key) => {
      const result = inferTargetType(
        key,
        makeSemantic({ semanticRole: "button" }),
        makeConstraints(),
      );

      expect(result).toEqual({ uiType: "secondary-button", translationRole: "imperative-verb" });
    },
  );

  it("prefers the primary pattern over the secondary one when a button key matches both", () => {
    const result = inferTargetType(
      "dialog.cancel.save",
      makeSemantic({ semanticRole: "button" }),
      makeConstraints(),
    );

    expect(result).toEqual({ uiType: "primary-button", translationRole: "imperative-verb" });
  });

  it("leaves a tiny-width role that is neither caption nor body-text as body-text", () => {
    const result = inferTargetType(
      "misc.value",
      makeSemantic({ semanticRole: "unknown" }),
      makeConstraints({ widthBucket: "tiny" }),
    );

    expect(result).toEqual({ uiType: "body-text", translationRole: "descriptive-text" });
  });

  it("classifies an empty button key as primary-button", () => {
    const result = inferTargetType("", makeSemantic({ semanticRole: "button" }), makeConstraints());

    expect(result).toEqual({ uiType: "primary-button", translationRole: "imperative-verb" });
  });
});
