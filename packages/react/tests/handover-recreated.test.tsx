/**
 * The handover's `catalogs` is a SERVER SNAPSHOT (owner, 2026-11-11): a re-render passes the
 * same object; a new server result comes as a new object, and a new object is applied again.
 * The documented recipe holds the snapshot once (module scope): an explicit retry after the
 * server's `null` is not aborted by ordinary re-renders. An inline literal re-created on every
 * render is a new result each time — pinned here as the stated consequence, not a guarantee.
 */
import { useState, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, useI18n, type I18n } from "../src";

/** The documented recipe: the server's data read once, at module scope (`window.__I18N__`). */
const SNAPSHOT = { catalogs: { admin: { en: null } } };

const setup = () => {
  const gates: (() => void)[] = [];
  const loader = vi.fn(
    (_l: string, _n: string) =>
      new Promise<Record<string, string>>((ok) => gates.push(() => ok({ title: "Admin" }))),
  );
  const i18n: I18n = createI18n({
    locale: "en",
    catalogs: { default: { en: { x: "x" } } },
    loader,
    onError: () => {},
  });
  return { i18n, loader, release: () => gates.splice(0).forEach((g) => g()) };
};

const retryApp = (i18n: I18n, catalogs: () => { admin: { en: null } }, outcome: string[]) => {
  let renders = 0;
  let bump!: () => void;
  function Page() {
    if (++renders > 50) throw new Error("looped");
    const { isReady, isLoading, t } = useI18n("admin");
    const [n, setN] = useState(0);
    bump = () => setN(n + 1);
    return (
      <I18nHandover catalogs={catalogs()}>
        {isReady ? (
          <p data-testid="s">{t("title") as ReactNode}</p>
        ) : isLoading ? (
          <i data-testid="s">loading</i>
        ) : (
          <button
            data-testid="s"
            onClick={() =>
              void i18n.load("admin").then(
                () => outcome.push("resolved"),
                () => outcome.push("rejected"),
              )
            }
          >
            retry
          </button>
        )}
      </I18nHandover>
    );
  }
  render(
    <I18nProvider i18n={i18n}>
      <Page />
    </I18nProvider>,
  );
  return { renders: () => renders, bump: () => bump() };
};

describe("the documented recipe: the server snapshot held once", () => {
  it("an explicit retry is not aborted by its own publication or a parent state change", async () => {
    const { i18n, loader, release } = setup();
    const outcome: string[] = [];
    const app = retryApp(i18n, () => SNAPSHOT.catalogs, outcome);
    await act(async () => {});
    expect(screen.getByTestId("s").textContent).toBe("retry");
    await act(async () => fireEvent.click(screen.getByTestId("s")));
    expect(screen.getByTestId("s").textContent).toBe("loading");
    await act(async () => app.bump());
    expect(screen.getByTestId("s").textContent).toBe("loading");
    await act(async () => release());
    await act(async () => {});
    expect(outcome).toEqual(["resolved"]);
    expect(screen.getByTestId("s").textContent).toBe("Admin");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("a NEW server result (a new object, the same content) is applied again: the pair fails again", async () => {
    const loader = vi.fn(async () => ({ title: "Admin" }));
    const i18n = createI18n({ locale: "en", loader, onError: () => {} });
    const Read = () => <p data-testid="s">{useI18n("admin").t("title") as ReactNode}</p>;
    const ui = (catalogs: { admin: { en: null } }) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover catalogs={catalogs}>
          <Read />
        </I18nHandover>
      </I18nProvider>
    );
    const first = { admin: { en: null } };
    const { rerender } = render(ui(first));
    await act(async () => {});
    await act(() => i18n.load("admin"));
    expect(screen.getByTestId("s").textContent).toBe("Admin");
    await act(async () => rerender(ui(first)));
    expect(screen.getByTestId("s").textContent).toBe("Admin");
    await act(async () => rerender(ui({ admin: { en: null } })));
    expect(screen.getByTestId("s").textContent).toBe("title");
  });
});

describe("the stated consequence of an inline literal (re-created on every render)", () => {
  it("a `null` slot: the retry's own publication re-applies it, the retry rejects, the button returns (bounded)", async () => {
    const { i18n, loader, release } = setup();
    const outcome: string[] = [];
    const app = retryApp(i18n, () => ({ admin: { en: null } }), outcome);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByTestId("s")));
    await act(async () => release());
    await act(async () => {});
    expect(outcome).toEqual(["rejected"]);
    expect(screen.getByTestId("s").textContent).toBe("retry");
    expect(loader).toHaveBeenCalledTimes(1);
    // Measured value of the pinned fact; the bound is the `> 50` guard in `Page`.
    expect(app.renders()).toBe(4);
  });

  it("a catalog: re-applied on every render, an `add()` patch to its slot is replaced; no loop", async () => {
    const i18n = createI18n({ locale: "en", onError: () => {} });
    let renders = 0;
    let pubs = 0;
    i18n.on(() => pubs++);
    function Page() {
      if (++renders > 50) throw new Error("looped");
      const { t } = useI18n("admin");
      return (
        <I18nHandover catalogs={{ admin: { en: { title: "Admin" } } }}>
          <p data-testid="s">
            {t("title") as ReactNode}|{t("extra") as ReactNode}
          </p>
        </I18nHandover>
      );
    }
    render(
      <I18nProvider i18n={i18n}>
        <Page />
      </I18nProvider>,
    );
    await act(async () => {});
    // Measured values of the pinned fact; the bound is the `> 50` guard in `Page`.
    expect([renders, pubs]).toEqual([2, 2]);
    await act(async () => i18n.add("en", { extra: "Patched" }, "admin"));
    await act(async () => {});
    expect(screen.getByTestId("s").textContent).toBe("Admin|extra");
    expect([renders, pubs]).toEqual([4, 4]);
  });
});
