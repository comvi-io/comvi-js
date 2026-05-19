/**
 * I18nProvider.test.tsx — W1.6 regression for locale-prop validation.
 *
 * Audit ref: Dim 13 P2 in `packages/react/AUDIT-FINDINGS.md`
 * (`packages/next/src/client/I18nProvider.tsx:117-119` previously mutated
 * `i18n.locale = locale` with no validation that `locale` is in the
 * configured `routing.locales` list. A misconfigured layout would silently
 * propagate a bad locale to descendant translations and downstream
 * `setLocaleAsync` calls — confusing to debug.)
 *
 * Fix verified: when `routing` is provided AND `locale` is not in
 * `routing.locales`, the provider calls `i18n.reportError(...)` with a
 * descriptive diagnostic and does NOT mutate `i18n.locale`. When `routing`
 * is omitted, behavior is unchanged (no validation — defensive only).
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { I18nProvider } from "../src/client/I18nProvider";
import type { RoutingConfig } from "../src/routing/types";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

describe("Next <I18nProvider> locale validation (W1.6)", () => {
  const routing: RoutingConfig = {
    locales: ["en", "fr", "de"],
    defaultLocale: "en",
  };

  it("does NOT mutate i18n.locale when locale is not in routing.locales", () => {
    const fake = new FakeI18n();
    const i18n = fake.asI18n();
    fake.language = "en";

    render(
      <I18nProvider i18n={i18n} locale="zz" routing={routing} autoInit={false}>
        <div data-testid="child" />
      </I18nProvider>,
    );

    // Locale was NOT advanced to "zz" because validation rejected it.
    expect(fake.language).toBe("en");
    // reportError was called (provider runs syncLocaleSafely both during
    // the first render and again in useLayoutEffect — call count is >=1).
    expect(fake.reportError).toHaveBeenCalled();
    const [errArg, ctxArg] = fake.reportError.mock.calls[0];
    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toContain(`"zz"`);
    expect((errArg as Error).message).toContain("not in routing.locales");
    expect(ctxArg).toMatchObject({
      source: "init",
      locale: "zz",
    });
  });

  it("DOES mutate i18n.locale when locale IS in routing.locales", () => {
    const fake = new FakeI18n();
    const i18n = fake.asI18n();
    fake.language = "en";

    render(
      <I18nProvider i18n={i18n} locale="fr" routing={routing} autoInit={false}>
        <div data-testid="child" />
      </I18nProvider>,
    );

    expect(fake.language).toBe("fr");
    expect(fake.reportError).not.toHaveBeenCalled();
  });

  it("does NOT validate (back-compat) when routing prop is omitted", () => {
    const fake = new FakeI18n();
    const i18n = fake.asI18n();
    fake.language = "en";

    // No routing -> any locale string accepted (audit Dim 13 P2 is defensive
    // only; without routing config there is no source of truth to validate
    // against).
    render(
      <I18nProvider i18n={i18n} locale="zz" autoInit={false}>
        <div data-testid="child" />
      </I18nProvider>,
    );

    expect(fake.language).toBe("zz");
    expect(fake.reportError).not.toHaveBeenCalled();
  });

  it("validates again on subsequent renders (useLayoutEffect path)", () => {
    const fake = new FakeI18n();
    const i18n = fake.asI18n();
    fake.language = "en";

    const { rerender } = render(
      <I18nProvider i18n={i18n} locale="fr" routing={routing} autoInit={false}>
        <div data-testid="child" />
      </I18nProvider>,
    );
    expect(fake.language).toBe("fr");

    // Re-render with an invalid locale — must NOT mutate, reportError fires.
    rerender(
      <I18nProvider i18n={i18n} locale="zz" routing={routing} autoInit={false}>
        <div data-testid="child" />
      </I18nProvider>,
    );
    expect(fake.language).toBe("fr"); // unchanged
    expect(fake.reportError).toHaveBeenCalled();
  });
});
