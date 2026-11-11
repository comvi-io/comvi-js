/**
 * The handover's snapshot with explicit params (moved from the removed defaultParams file,
 * owner decision 2026-11-11): a component mounted in the commit that brings catalogs and a
 * locale reads them during its render; a hydration of handed catalogs renders the server's text;
 * a repeated payload keeps the subtree's state (no remount). Params are passed to `t()`.
 */
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, useI18n, type HandoverCatalogs } from "../src";

describe("the handover's snapshot with explicit params", () => {
  it("a component mounted in the commit that brings catalogs and a locale reads them in its render", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hi, {name}" } } });
    const drafts: string[] = [];
    function Draft() {
      const { t, locale } = useI18n();
      const [d] = useState(() => `${locale}|${t("hi", { name: "B" }) as string}`);
      drafts.push(d);
      return <p data-testid="d">{d}</p>;
    }
    const ui = (locale: string, mount: boolean) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover
          catalogs={{ default: { uk: { hi: `Привіт, {name} (${locale})` } } }}
          locale={locale}
        >
          {mount && <Draft />}
        </I18nHandover>
      </I18nProvider>
    );
    const { rerender } = render(ui("en", false));
    await act(async () => rerender(ui("uk", true)));
    // The catalog of THIS render (its text names the render's locale), not the earlier one.
    expect(drafts[0]).toBe("uk|Привіт, B (uk)");
    expect(screen.getByTestId("d").textContent).toBe("uk|Привіт, B (uk)");
  });

  it("hydrates the handed catalogs with explicit params: no mismatch", async () => {
    const cats: HandoverCatalogs = { default: { en: { hi: "Welcome to {brand}" } } };
    const Show = () => <p>{useI18n().t("hi", { brand: "Comvi" }) as string}</p>;
    const ui = (i: ReturnType<typeof createI18n>) => (
      <I18nProvider i18n={i}>
        <I18nHandover catalogs={cats}>
          <Show />
        </I18nHandover>
      </I18nProvider>
    );
    const html = renderToString(ui(createI18n({ locale: "en", catalogs: cats })));
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.append(el);
    const errors: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: { unmount(): void } | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(el, ui(createI18n({ locale: "en" })), {
          onRecoverableError: (e) => errors.push(e),
        });
      });
      expect(errors).toEqual([]);
      expect(err).not.toHaveBeenCalled();
      expect(el.textContent).toBe("Welcome to Comvi");
    } finally {
      err.mockRestore();
      root?.unmount();
      el.remove();
    }
  });

  it("a repeated payload keeps the subtree's state (no remount)", async () => {
    const i18n = createI18n({ locale: "en" });
    function Counter() {
      const [n, setN] = useState(0);
      return (
        <button data-testid="c" onClick={() => setN(n + 1)}>
          {useI18n().t("hi", { name: "Ann" }) as string}|{n}
        </button>
      );
    }
    const ui = (hi: string) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover catalogs={{ default: { en: { hi } } }}>
          <Counter />
        </I18nHandover>
      </I18nProvider>
    );
    const { rerender } = render(ui("Hi {name}"));
    fireEvent.click(screen.getByTestId("c"));
    await act(async () => rerender(ui("Hello {name}")));
    expect(screen.getByTestId("c").textContent).toBe("Hello Ann|1");
  });
});
