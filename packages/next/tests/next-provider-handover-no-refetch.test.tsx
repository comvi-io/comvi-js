/**
 * What the Next <I18nProvider> does with the catalog the server hands over,
 * on every path a locale reaches it: the first mount (hydration), a mount on a
 * host that is already running (a remount on navigation), and a later render
 * with a new `locale` (a client navigation).
 *
 *  • The browser never fetches a catalog the server just delivered. The
 *    provider used to assign the locale BEFORE adding the messages: the locale
 *    setter starts a guarded `setLocale`, which loads every active namespace
 *    not yet cached, so each switch re-requested the catalog and `isLoading`
 *    stayed true until the duplicate answered (examples:e2e --cdn, step v,
 *    next: a second full loader timeout against a hanging CDN).
 *  • The render that receives the new `locale` already shows its text, so the
 *    text commits together with the `<html lang>` the same server payload
 *    carries (examples:e2e step r, next: `lang="uk"` over English text for
 *    one delivered mutation batch).
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useI18n } from "@comvi/react";

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

/** Every render of the subtree: the locale the provider was given, and the text it showed. */
type Rendered = { given: string; text: string };
const Probe = ({ given, log }: { given: string; log: Rendered[] }) => {
  const { t } = useI18n();
  const text = t("greeting");
  log.push({ given, text });
  return <p>{text}</p>;
};

const tree = (i18n: ReturnType<typeof createHost>["i18n"], locale: string, log: Rendered[]) => (
  <I18nProvider i18n={i18n} locale={locale} messages={handover(locale)} autoInit={false}>
    <Probe given={locale} log={log} />
  </I18nProvider>
);

const settle = () => act(async () => {});

describe("Next <I18nProvider> hands the server's catalog over", () => {
  it("first mount in a locale other than the host's: no fetch, no render in the old locale", async () => {
    const { i18n, loader } = createHost();
    const log: Rendered[] = [];
    render(tree(i18n, "uk", log));
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(i18n.locale).toBe("uk");
    expect(i18n.isLoading).toBe(false);
    expect(log.map((entry) => entry.text)).not.toContain("Hello");
  });

  it("a mount on a running host (a remount on navigation): no fetch, the new text at once", async () => {
    const { i18n, loader } = createHost();
    i18n.addMessages(handover("en"));
    await i18n.init();
    expect(i18n.getActiveNamespaces()).toContain("default");
    const log: Rendered[] = [];
    render(tree(i18n, "uk", log));
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(i18n.locale).toBe("uk");
    expect(i18n.isLoading).toBe(false);
    expect(log[0]).toEqual({ given: "uk", text: "Привіт" });
  });

  it("a client navigation to another locale: no fetch, and the new text in the same render", async () => {
    const { i18n, loader } = createHost();
    const log: Rendered[] = [];
    const { rerender } = render(tree(i18n, "en", log));
    await settle();
    log.length = 0;
    rerender(tree(i18n, "uk", log));
    await settle();
    expect(loader).not.toHaveBeenCalled();
    expect(i18n.locale).toBe("uk");
    expect(i18n.isLoading).toBe(false);
    // Every render given uk showed uk: none lagged one render behind.
    expect(log.filter((entry) => entry.given === "uk" && entry.text !== "Привіт")).toEqual([]);
    expect(log.length).toBeGreaterThan(0);
  });

  it("a locale outside routing.locales is reported, never applied, and never rendered in", async () => {
    const { i18n } = createHost();
    i18n.addMessages(handover("en"));
    const reportError = vi.spyOn(i18n, "reportError");
    const log: Rendered[] = [];
    render(
      <I18nProvider
        i18n={i18n}
        locale="zz"
        routing={{ locales: ["en", "uk"], defaultLocale: "en" }}
        messages={{ "zz:default": { greeting: "Zz" } }}
        autoInit={false}
      >
        <Probe given="zz" log={log} />
      </I18nProvider>,
    );
    await settle();
    expect(reportError).toHaveBeenCalled();
    expect(i18n.locale).toBe("en");
    expect(log.map((entry) => entry.text)).toEqual(log.map(() => "Hello"));
    expect(log.length).toBeGreaterThan(0);
  });

  it("after the handover, a setLocale with no new prop still re-renders (localePrefix: never)", async () => {
    const { i18n } = createHost();
    i18n.addMessages({ ...handover("en"), ...handover("uk") });
    const log: Rendered[] = [];
    render(tree(i18n, "uk", log));
    await settle();
    await act(async () => {
      await i18n.setLocale("en");
    });
    expect(log[log.length - 1].text).toBe("Hello");
  });
});
