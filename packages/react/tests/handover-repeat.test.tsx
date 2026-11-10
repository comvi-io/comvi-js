/**
 * A repeated server payload through `<I18nHandover catalogs locale>` (lot 6a audit, owner
 * instruction 2026-11-10): what a later catalogs object of the same handover hands over for a
 * slot it handed before is the slot's content, as the server holds it — a key the server no
 * longer has is gone, an empty catalog empties the slot; a `null` wins over a load in flight;
 * the handover's own locale switch keeps the failures it was handed. A slot the handover hands
 * for the first time still merges over what the instance had, and `add()` stays a patch.
 */
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createI18n,
  I18nHandover,
  I18nProvider,
  useI18n,
  type HandoverCatalogs,
  type I18n,
} from "../src";
import { flush, manualLoader, settle } from "./helpers";

function Probe({ ns = "default", k }: { ns?: string; k: string }) {
  const { t, isLoading, locale } = useI18n(ns);
  return (
    <p data-testid={k} data-loading={String(isLoading)}>
      {locale}|{t(k) as string}
    </p>
  );
}
const tree = (
  i18n: I18n,
  catalogs: HandoverCatalogs,
  keys: string[],
  ns?: string,
  locale?: string,
) => (
  <I18nProvider i18n={i18n}>
    <I18nHandover catalogs={catalogs} locale={locale}>
      {keys.map((k) => (
        <Probe key={k} k={k} ns={ns} />
      ))}
    </I18nHandover>
  </I18nProvider>
);
const text = (k: string) => screen.getByTestId(k).textContent;

describe("a repeated payload replaces what the handover handed before (finding 2)", () => {
  it("a key the server no longer has renders missing, at once and after commit; an empty catalog empties the slot", async () => {
    const first = { default: { uk: { a: "A", b: "B" } } };
    const i18n = createI18n({ locale: "uk", catalogs: first, onError: () => {} });
    const { rerender } = render(tree(i18n, first, ["a", "b"]));
    expect([text("a"), text("b")]).toEqual(["uk|A", "uk|B"]);
    await act(async () => rerender(tree(i18n, { default: { uk: { a: "A2" } } }, ["a", "b"])));
    expect([text("a"), text("b")]).toEqual(["uk|A2", "uk|b"]);
    expect(i18n.t("b")).toBe("b");
    await act(async () => rerender(tree(i18n, { default: { uk: {} } }, ["a", "b"])));
    expect([text("a"), text("b")]).toEqual(["uk|a", "uk|b"]);
  });

  it("a slot handed for the first time merges over the instance's; add() stays a patch", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { a: "A", b: "B" } } });
    render(tree(i18n, { default: { en: { b: "b2" } } }, ["a", "b"]));
    await settle();
    expect([text("a"), text("b")]).toEqual(["en|A", "en|b2"]);
    i18n.add("en", { c: "C" });
    expect(i18n.t("a")).toBe("A");
  });
});

describe("a null slot against a load in flight (finding 3)", () => {
  it("the late response does not restore the catalog; ready settles; isLoading is false", async () => {
    const m = manualLoader();
    const i18n = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      loader: m.load,
      catalogs: { default: { uk: {}, en: {} } },
      onError: () => {},
    });
    const { rerender } = render(tree(i18n, { default: { uk: {}, en: {} } }, ["title"], "admin"));
    await settle();
    expect(m.requested).toEqual(["uk:admin", "en:admin"]);
    await act(async () =>
      rerender(tree(i18n, { admin: { uk: null, en: { title: "Admin" } } }, ["title"], "admin")),
    );
    expect(text("title")).toBe("uk|Admin");
    await m.answer("uk:admin", { title: "late" });
    expect(text("title")).toBe("uk|Admin");
    expect(i18n.t("title", { ns: "admin" })).toBe("Admin");
    // The aborted request settled; the rest of the loads in flight settle on their own.
    await m.answer("en:admin", { title: "Admin" });
    await act(() => i18n.ready);
    expect(screen.getByTestId("title").dataset.loading).toBe("false");
  });
});

describe("a null slot with a locale change (finding 4)", () => {
  it("the handover's own switch keeps the failure: no request for it", async () => {
    const m = manualLoader();
    const i18n = createI18n({
      locale: "en",
      fallbackLocale: "en",
      loader: m.load,
      catalogs: { default: { en: { title: "Hi" } }, admin: { en: { title: "Admin" } } },
      onError: () => {},
    });
    const { rerender } = render(
      tree(i18n, { admin: { en: { title: "Admin" } } }, ["title"], "admin"),
    );
    await settle();
    await act(async () =>
      rerender(
        tree(
          i18n,
          { admin: { uk: null, en: { title: "Admin" } }, default: { uk: { title: "Привіт" } } },
          ["title"],
          "admin",
          "uk",
        ),
      ),
    );
    await act(flush);
    expect(m.requested.filter((r) => r === "uk:admin")).toEqual([]);
    expect(i18n.locale).toBe("uk");
    expect(text("title")).toBe("uk|Admin");
    expect(m.requested.filter((r) => r === "uk:admin")).toEqual([]);
    // The user's explicit retry keeps its contract.
    void i18n.load("admin");
    await act(flush);
    expect(m.requested.filter((r) => r === "uk:admin")).toEqual(["uk:admin"]);
  });
});

describe("re-review of lot 6a (2026-11-10)", () => {
  it("a slot handed before stays replaced after a payload that omitted it (item 1)", async () => {
    const first = { default: { en: { a: "A", b: "B" } } };
    const i18n = createI18n({ locale: "en", catalogs: first, onError: () => {} });
    const { rerender } = render(tree(i18n, first, ["a", "b"]));
    // An omitted slot is not deleted.
    await act(async () => rerender(tree(i18n, { other: { en: { x: "X" } } }, ["a", "b"])));
    expect([text("a"), text("b")]).toEqual(["en|A", "en|B"]);
    // It comes back: replaced, not merged.
    await act(async () => rerender(tree(i18n, { default: { en: { a: "A2" } } }, ["a", "b"])));
    expect([text("a"), text("b")]).toEqual(["en|A2", "en|b"]);
    await act(async () => rerender(tree(i18n, { other: { en: { x: "X" } } }, ["a", "b"])));
    await act(async () => rerender(tree(i18n, { default: { en: {} } }, ["a", "b"])));
    expect([text("a"), text("b")]).toEqual(["en|a", "en|b"]);
  });

  it("a later payload in a locale whose own catalog failed lands there, like a first one (item 2)", async () => {
    const payload = { default: { en: { title: "Hello" }, de: null } };
    const fresh = createI18n({
      locale: "de",
      fallbackLocale: "en",
      catalogs: payload,
      onError: () => {},
    });
    render(tree(fresh, payload, ["title"], "default", "de"));
    await settle();
    const expected = text("title");
    expect(expected).toBe("de|Hello");

    document.body.innerHTML = "";
    const i18n = createI18n({
      locale: "fr",
      fallbackLocale: "en",
      catalogs: { default: { fr: { title: "Bonjour" }, en: { title: "Hello" } } },
      onError: () => {},
    });
    const { rerender } = render(
      tree(
        i18n,
        { default: { fr: { title: "Bonjour" }, en: { title: "Hello" } } },
        ["title"],
        "default",
        "fr",
      ),
    );
    expect(text("title")).toBe("fr|Bonjour");
    await act(async () => rerender(tree(i18n, payload, ["title"], "default", "de")));
    await settle();
    expect(text("title")).toBe(expected);
    expect(i18n.locale).toBe("de");
  });
});
