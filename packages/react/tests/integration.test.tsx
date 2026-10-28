/**
 * An app on the product's main path: createI18n + cdn() (CDN v1 layout) + detect() +
 * the provider, hooks and <T>. Ported by meaning from 0.7 integration.test.tsx: a language
 * switcher workflow (hook + <T>), a dynamic namespace with its loading state, a namespace
 * load that fails (the loading state clears and the failure is reported).
 */
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cdn } from "@comvi/core/cdn";
import { detect } from "@comvi/core/plugins";
import { createI18n, I18nProvider, T, useI18n, type I18nError } from "../src";
import { flush, settle } from "./helpers";

const BASE = "https://cdn.example/d1";
const FILES: Record<string, object> = {
  "/en.json": {
    title: "Shop",
    items: "{count, plural, one {# item} other {# items}}",
    terms: "Read the <link>terms</link>",
  },
  "/de.json": {
    title: "Laden",
    items: "{count, plural, one {# Artikel} other {# Artikel}}",
    terms: "Lies die <link>AGB</link>",
  },
  "/account/en.json": { signed_in: "Signed in as {name}" },
  "/account/de.json": { signed_in: "Angemeldet als {name}" },
};

/** A CDN double: each request waits until `release()` (or answers at once with `auto`). */
const cdnDouble = (auto = true) => {
  const log: string[] = [];
  const held: (() => void)[] = [];
  const fetch = vi.fn(async (url: string) => {
    const path = url.slice(BASE.length);
    log.push(path);
    if (!auto) await new Promise<void>((y) => held.push(y));
    const body = FILES[path];
    return new Response(body ? JSON.stringify(body) : "nope", { status: body ? 200 : 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return {
    log,
    release: () => act(async () => (held.splice(0).forEach((y) => y()), await flush())),
  };
};

const Switcher = () => {
  const { locale, setLocale, isLoading } = useI18n();
  return (
    <select
      aria-label="locale"
      value={locale}
      disabled={isLoading}
      onChange={(e) => void setLocale(e.target.value)}
    >
      <option value="en">en</option>
      <option value="de">de</option>
    </select>
  );
};

const Cart = ({ count }: { count: number }) => {
  const { t } = useI18n();
  return (
    <section>
      <h1>{t("title") as string}</h1>
      <p data-testid="items">{t("items", { count }) as string}</p>
      <p data-testid="terms">
        <T i18nKey="terms" link={(c: ReactNode) => <a href="/terms">{c}</a>} />
      </p>
    </section>
  );
};

describe("an app on createI18n + cdn() + detect()", () => {
  it("handles a language switcher workflow (hook + <T>)", async () => {
    const net = cdnDouble();
    const i18n = createI18n({
      locale: "en",
      loader: cdn(BASE),
      plugins: [detect({ supported: ["en", "de"], order: [] })],
    });
    render(
      <I18nProvider i18n={i18n} loading={<p>loading</p>}>
        <Switcher />
        <Cart count={2} />
      </I18nProvider>,
    );
    expect(screen.getByText("loading")).toBeTruthy();
    await settle();
    expect(screen.getByRole("heading").textContent).toBe("Shop");
    expect(screen.getByTestId("items").textContent).toBe("2 items");
    expect(screen.getByTestId("terms").innerHTML).toBe('Read the <a href="/terms">terms</a>');
    await act(async () => {
      fireEvent.change(screen.getByLabelText("locale"), { target: { value: "de" } });
      await flush();
    });
    await settle();
    expect(screen.getByRole("heading").textContent).toBe("Laden");
    expect(screen.getByTestId("terms").innerHTML).toBe('Lies die <a href="/terms">AGB</a>');
    expect(net.log).toEqual(["/en.json", "/de.json"]);
  });

  it("loads a dynamic namespace and updates its loading state", async () => {
    const net = cdnDouble(false);
    const i18n = createI18n({ locale: "en", loader: cdn(BASE) });
    const Account = () => {
      const { t, isLoading } = useI18n("account");
      return (
        <p data-testid="acct">{isLoading ? "…" : (t("signed_in", { name: "Ann" }) as string)}</p>
      );
    };
    render(
      <I18nProvider i18n={i18n}>
        <Account />
      </I18nProvider>,
    );
    expect(screen.getByTestId("acct").textContent).toBe("…");
    await net.release();
    await net.release();
    expect(screen.getByTestId("acct").textContent).toBe("Signed in as Ann");
    expect(net.log).toEqual(["/en.json", "/account/en.json"]);
  });

  it("clears the loading state and reports the failure when a namespace load fails", async () => {
    cdnDouble();
    const errors: I18nError[] = [];
    const i18n = createI18n({ locale: "en", loader: cdn(BASE), onError: (e) => errors.push(e) });
    const Missing = () => {
      const { t, isLoading } = useI18n("nope");
      return <p data-testid="m">{isLoading ? "…" : (t("k") as string)}</p>;
    };
    render(
      <I18nProvider i18n={i18n}>
        <Missing />
      </I18nProvider>,
    );
    await settle();
    await settle();
    expect(screen.getByTestId("m").textContent).toBe("k");
    expect(errors.some((e) => e.code === "load_failed" && e.ns === "nope")).toBe(true);
  });
});
