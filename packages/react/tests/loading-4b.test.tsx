/**
 * Lot 4b part A (owner brief 29.10): the first-paint gate commits (a render React abandons
 * changes nothing), a direct `<I18nHandover>` child is never hidden by it, and `useI18n()`
 * activates `default` too; a failed load ends the placeholder.
 */
import { startTransition } from "react";
import { createRoot } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, useI18n, type ProviderCatalogs } from "../src";
import { make, manualLoader, settle } from "./helpers";

const Show = () => {
  const { t, locale } = useI18n();
  return <p>{`${locale}:${t("hi") as string}`}</p>;
};

describe("first-paint gate (lot 4b)", () => {
  it("a render React abandons does not open the gate: the next render still waits", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: { hi: "Hello" } }, loader: l.load });
    const never = new Promise<never>(() => {});
    const Suspends = () => {
      throw never;
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    // A transition whose render suspends with no boundary: React abandons it, nothing
    // commits — but the provider rendered once with nothing in flight.
    await act(async () =>
      startTransition(() =>
        root.render(
          <I18nProvider i18n={i18n} loading="wait">
            <Suspends />
          </I18nProvider>,
        ),
      ),
    );
    expect(container.textContent).toBe("");
    await act(async () => void i18n.load("shop")); // a load in flight before the first paint
    await act(async () =>
      root.render(
        <I18nProvider i18n={i18n} loading="wait">
          <Show />
        </I18nProvider>,
      ),
    );
    expect(container.textContent).toBe("wait");
    await l.answer("en:shop");
    expect(container.textContent).toBe("en:Hello");
    act(() => root.unmount());
  });

  it("after the first paint commits, a later load keeps the children on screen", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: { hi: "Hello" } }, loader: l.load });
    const { container } = render(
      <I18nProvider i18n={i18n} loading="wait">
        <Show />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("en:Hello");
    await act(async () => void i18n.load("shop"));
    expect(container.textContent).toBe("en:Hello");
  });

  it("a direct <I18nHandover> child renders through `loading`: its catalogs paint at once", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load }); // en:default in flight
    const catalogs: ProviderCatalogs = { default: { uk: { hi: "Привіт" } } };
    const { container } = render(
      <I18nProvider i18n={i18n} loading="wait">
        <I18nHandover locale="uk" catalogs={catalogs}>
          <Show />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(container.textContent).toBe("uk:Привіт");
    await settle();
    expect(i18n.locale).toBe("uk");
    expect(l.requested.filter((r) => r.startsWith("uk"))).toEqual([]);
  });

  it("hydrates a server render through `loading` on a client instance still loading (0 mismatches, 0 requests for the payload)", async () => {
    const catalogs: ProviderCatalogs = { default: { uk: { hi: "Привіт" } } };
    const ui = (i: ReturnType<typeof createI18n>, suspense?: boolean) => (
      <I18nProvider i18n={i} loading="wait" suspense={suspense}>
        <I18nHandover locale="uk" catalogs={catalogs}>
          <Show />
        </I18nHandover>
      </I18nProvider>
    );
    const server = createI18n({ locale: "uk", messages: { uk: { hi: "Привіт" } } });
    for (const suspense of [false, true]) {
      const container = document.createElement("div");
      container.innerHTML = renderToString(ui(server, suspense));
      expect(container.textContent).toBe("uk:Привіт");
      const loader = vi.fn(
        (_l: string, _n: string, _s: AbortSignal) => new Promise<never>(() => {}),
      );
      const client = createI18n({ locale: "en", loader }); // knows nothing yet: en:default loads
      const errors: unknown[] = [];
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, ui(client, suspense), {
          onRecoverableError: (e) => errors.push(e),
        });
      });
      await settle();
      expect(errors).toEqual([]);
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
      expect(container.textContent).toBe("uk:Привіт");
      expect(
        loader.mock.calls.map(([l, n]) => `${l}:${n}`).filter((r) => r.startsWith("uk")),
      ).toEqual([]);
      act(() => root.unmount());
    }
  });

  it("a `loading` of null renders nothing while busy; no `loading` renders the children", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const a = make({ locale: "en", loader: l.load }).i18n;
    const { container } = render(
      <I18nProvider i18n={a} loading={null}>
        <Show />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("");
    await l.answer("en:default");
    expect(container.textContent).toBe("en:Hello");
  });
});

describe("useI18n() activates `default` (lot 4b)", () => {
  it("an app whose `namespaces` leave `default` out loads it on first use; isLoading settles", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" }, "en:account": {} });
    const { i18n } = make({ locale: "en", namespaces: ["account"], loader: l.load });
    const seen: boolean[] = [];
    const Probe = () => {
      const { t, isLoading } = useI18n();
      seen.push(isLoading);
      return <p>{isLoading ? "…" : (t("hi") as string)}</p>;
    };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("…");
    expect(l.requested).toEqual(["en:account", "en:default"]);
    await l.answer("en:account");
    await l.answer("en:default");
    expect(container.textContent).toBe("Hello");
    expect(seen.at(-1)).toBe(false);
  });

  it("a failed load ends the placeholder: isLoading false, the missing-key text", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Probe = () => {
      const { t, isLoading } = useI18n("shop");
      return <p>{isLoading ? "…" : (t("title") as string)}</p>;
    };
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("…");
    await l.fail("en:shop");
    expect(container.textContent).toBe("title");
  });
});
