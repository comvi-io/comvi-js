/**
 * When `routing` is provided and `locale` is not in `routing.locales`,
 * <I18nProvider> calls `i18n.reportError` and skips the mutation. Without
 * `routing`, behavior is unchanged (no validation — defensive only).
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { I18nProvider } from "../src/client/I18nProvider";
import type { RoutingConfig } from "../src/routing/types";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

describe("Next <I18nProvider> locale validation", () => {
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

    expect(fake.language).toBe("en");
    // syncLocaleSafely runs both during the first render and again in
    // useLayoutEffect, so the count is >= 1, not exactly 1.
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

    // No routing config: there is no source of truth to validate against, so
    // any locale string is accepted.
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

    rerender(
      <I18nProvider i18n={i18n} locale="zz" routing={routing} autoInit={false}>
        <div data-testid="child" />
      </I18nProvider>,
    );
    expect(fake.language).toBe("fr"); // unchanged
    expect(fake.reportError).toHaveBeenCalled();
  });
});
