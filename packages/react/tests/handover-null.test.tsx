/**
 * `<I18nHandover catalogs>` with a failed (`null`) slot, the shape of a server payload
 * (`handover()` of `@comvi/core/ssr`). Lot 6a, owner decision after the review: a later payload
 * carries the same meaning as the one the instance was created from (`createI18n({ catalogs })`):
 * a `null` slot is a load that failed on the server — the subtree renders the fallback the
 * server rendered, and nothing asks for the pair until an explicit retry. No remount.
 */
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createI18n,
  I18nHandover,
  I18nProvider,
  useI18n,
  type HandoverCatalogs,
  type I18n,
} from "../src";

function Probe({ ns = "default" }: { ns?: string }) {
  const { t, isLoading } = useI18n(ns);
  const [n, setN] = useState(0);
  return (
    <button data-testid="probe" data-loading={String(isLoading)} onClick={() => setN(n + 1)}>
      {t("title")}|{n}
    </button>
  );
}

const tree = (i18n: I18n, catalogs: HandoverCatalogs, ns?: string) => (
  <I18nProvider i18n={i18n}>
    <I18nHandover catalogs={catalogs}>
      <Probe ns={ns} />
    </I18nHandover>
  </I18nProvider>
);

describe("<I18nHandover> with a failed slot (lot 6a)", () => {
  it("a slot that loaded and is null in a later payload renders the fallback, at once and after commit", async () => {
    const loader = vi.fn(async (_l: string, _n: string) => ({ title: "x" }));
    const i18n = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      loader,
      catalogs: { default: { uk: { title: "Привіт" }, en: { title: "Hello" } } },
    });
    const { rerender } = render(
      tree(i18n, { default: { uk: { title: "Привіт" }, en: { title: "Hello" } } }),
    );
    expect(screen.getByTestId("probe").textContent).toBe("Привіт|0");
    // The state of the subtree survives the payload update: no remount.
    fireEvent.click(screen.getByTestId("probe"));
    await act(async () => rerender(tree(i18n, { default: { uk: null, en: { title: "Hello" } } })));
    expect(screen.getByTestId("probe").textContent).toBe("Hello|1");
    expect(screen.getByTestId("probe").dataset.loading).toBe("false");
    expect(i18n.t("title")).toBe("Hello");
    expect(loader).not.toHaveBeenCalled();
  });

  it("a namespace first handed over as null is not asked for until an explicit retry", async () => {
    const loader = vi.fn(async (_l: string, _n: string) => ({ title: "Адмін" }));
    const i18n = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      loader,
      catalogs: { default: { uk: {}, en: {} } },
    });
    const { rerender } = render(tree(i18n, { default: { uk: {}, en: {} } }, "default"));
    await act(async () =>
      rerender(tree(i18n, { admin: { uk: null, en: { title: "Admin" } } }, "admin")),
    );
    expect(screen.getByTestId("probe").textContent).toBe("Admin|0");
    await act(async () => {});
    expect(loader.mock.calls.filter((c) => c[1] === "admin")).toEqual([]);
    await act(() => i18n.load("admin"));
    expect(loader.mock.calls.filter((c) => c[1] === "admin").map((c) => c[0])).toEqual(["uk"]);
    expect(screen.getByTestId("probe").textContent).toBe("Адмін|0");
  });

  it("a null slot the instance already has as failed publishes nothing", async () => {
    const i18n = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      catalogs: { default: { uk: null, en: { title: "Hello" } } },
    });
    const rev = i18n.rev();
    render(tree(i18n, { default: { uk: null, en: { title: "Hello" } } }));
    await act(async () => {});
    expect(i18n.rev()).toBe(rev);
    expect(screen.getByTestId("probe").textContent).toBe("Hello|0");
  });
});
