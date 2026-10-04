/**
 * A catalog the server hands over through `<I18nProvider messages>` is never
 * fetched again by the browser.
 *
 * The provider used to assign the locale BEFORE adding the messages that came
 * with it. The locale setter starts a guarded `setLocale`, which asks the
 * loader for every active namespace not yet cached, and at that moment the
 * handed-over catalog was not cached yet: every client navigation re-requested
 * the catalog the RSC payload had just delivered, and `isLoading` stayed true
 * until that duplicate answered. Against a CDN that hangs, the page showed the
 * new language and "Loading…" for one more full loader timeout
 * (examples:e2e --cdn, step v, next).
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";

import { createNextI18n } from "../src/createNextI18n";
import { I18nProvider } from "../src/client/I18nProvider";

const CATALOGS: Record<string, Record<string, string>> = {
  "en:default": { greeting: "Hello" },
  "uk:default": { greeting: "Привіт" },
};

const createHost = () => {
  const { i18n } = createNextI18n({ locales: ["en", "uk"], defaultLocale: "en", devMode: false });
  // Never answers: a request for a handed-over catalog would keep the host loading.
  const loader = vi.fn(
    (_locale: string, _ns: string) => new Promise<Record<string, string>>(() => {}),
  );
  i18n.registerLoader(loader);
  return { i18n, loader };
};

const handover = (locale: string) => ({ [`${locale}:default`]: CATALOGS[`${locale}:default`] });

describe("Next <I18nProvider> hands the server's catalog over without a refetch", () => {
  it("first mount in a locale other than the host's", () => {
    const { i18n, loader } = createHost();
    render(
      <I18nProvider i18n={i18n} locale="uk" messages={handover("uk")} autoInit={false}>
        <div />
      </I18nProvider>,
    );
    expect(loader).not.toHaveBeenCalled();
    expect(i18n.locale).toBe("uk");
    expect(i18n.isLoading).toBe(false);
  });

  it("a client navigation to another locale", async () => {
    const { i18n, loader } = createHost();
    const { rerender } = render(
      <I18nProvider i18n={i18n} locale="en" messages={handover("en")} autoInit={false}>
        <div />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider i18n={i18n} locale="uk" messages={handover("uk")} autoInit={false}>
        <div />
      </I18nProvider>,
    );
    // A navigation's switch is asynchronous either way; let it settle.
    await act(async () => {});
    expect(loader).not.toHaveBeenCalled();
    expect(i18n.locale).toBe("uk");
    expect(i18n.isLoading).toBe(false);
  });
});
