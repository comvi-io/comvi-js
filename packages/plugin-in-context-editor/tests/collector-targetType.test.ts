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

function makeConstraints(overrides: Partial<ConstraintSignals["hard"]> = {}): ConstraintSignals {
  return {
    hard: { mustBeShort: false, singleLine: false, widthBucket: "medium", ...overrides },
    soft: { likelyTruncated: false, visuallyCompact: false, visualProminence: "medium" },
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

  it("also recognizes an html submit input and an aria role=button as a button", () => {
    const bySubmitType = inferTargetType(
      "form.go",
      makeSemantic({ semanticRole: "unknown", htmlType: "submit" }),
      makeConstraints(),
    );
    expect(bySubmitType.uiType).toBe("primary-button");

    const byAriaRole = inferTargetType(
      "form.go",
      makeSemantic({ semanticRole: "unknown", ariaRole: "button" }),
      makeConstraints(),
    );
    expect(byAriaRole.uiType).toBe("primary-button");
  });

  it("classifies a high-prominence heading as page-title, else section-title", () => {
    const pageTitle = inferTargetType(
      "home.title",
      makeSemantic({ semanticRole: "heading" }),
      makeConstraints({}),
    );
    // default visualProminence is "medium" in makeConstraints -> section-title
    expect(pageTitle).toEqual({ uiType: "section-title", translationRole: "noun-phrase" });

    const constraintsHighProminence: ConstraintSignals = {
      hard: { mustBeShort: false, singleLine: false, widthBucket: "full" },
      soft: { likelyTruncated: false, visuallyCompact: false, visualProminence: "high" },
    };
    const result = inferTargetType(
      "home.title",
      makeSemantic({ semanticRole: "heading" }),
      constraintsHighProminence,
    );
    expect(result).toEqual({ uiType: "page-title", translationRole: "noun-phrase" });
  });

  it("classifies a label role as form-label", () => {
    const result = inferTargetType(
      "auth.email.label",
      makeSemantic({ semanticRole: "label" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "form-label", translationRole: "field-label" });
  });

  it("classifies an input role as form-placeholder when the key mentions placeholder, else form-label", () => {
    const placeholder = inferTargetType(
      "auth.email.placeholder",
      makeSemantic({ semanticRole: "input" }),
      makeConstraints(),
    );
    expect(placeholder).toEqual({
      uiType: "form-placeholder",
      translationRole: "placeholder-hint",
    });

    const label = inferTargetType(
      "auth.email.field",
      makeSemantic({ semanticRole: "input" }),
      makeConstraints(),
    );
    expect(label).toEqual({ uiType: "form-label", translationRole: "field-label" });
  });

  it("classifies an alert role as an error-message", () => {
    const result = inferTargetType(
      "auth.error",
      makeSemantic({ semanticRole: "alert" }),
      makeConstraints(),
    );
    expect(result).toEqual({ uiType: "error-message", translationRole: "error-sentence" });
  });

  it("classifies menu-item and link roles as nav-item", () => {
    const menuItem = inferTargetType(
      "nav.settings",
      makeSemantic({ semanticRole: "menu-item" }),
      makeConstraints(),
    );
    expect(menuItem).toEqual({ uiType: "nav-item", translationRole: "nav-label" });

    const link = inferTargetType(
      "nav.home",
      makeSemantic({ semanticRole: "link" }),
      makeConstraints(),
    );
    expect(link).toEqual({ uiType: "nav-item", translationRole: "nav-label" });
  });

  it("classifies a small/tiny caption or body-text as a status-badge", () => {
    const caption = inferTargetType(
      "order.status",
      makeSemantic({ semanticRole: "caption" }),
      makeConstraints({ widthBucket: "tiny" }),
    );
    expect(caption).toEqual({ uiType: "status-badge", translationRole: "short-status" });

    const bodyText = inferTargetType(
      "order.status",
      makeSemantic({ semanticRole: "body-text" }),
      makeConstraints({ widthBucket: "small" }),
    );
    expect(bodyText).toEqual({ uiType: "status-badge", translationRole: "short-status" });
  });

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
});
