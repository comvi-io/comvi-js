/**
 * Lot 4b part A (owner brief 29.10): the first-paint gate commits (a render React abandons
 * changes nothing), waits only while a namespace has no text at all, never hides a
 * hydration (an `<I18nHandover>` at any depth), and `useI18n()` activates `default` too; a
 * failed load ends the placeholder.
 */
import { startTransition, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, useI18n, type ProviderCatalogs } from "../src";
import { make, manualLoader, reactWarnings, settle, shown } from "./helpers";

const Show = () => {
  const { t, locale } = useI18n();
  return <p>{`${locale}:${t("hi") as string}`}</p>;
};

describe("first-paint gate (lot 4b)", () => {
  it("with no text and no handover the placeholder is all that shows; the hidden mount stays hidden and opens in place", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const { i18n } = make({ locale: "en", loader: l.load });
    let container!: HTMLElement;
    const warnings = await reactWarnings(() => {
      ({ container } = render(
        <I18nProvider i18n={i18n} loading={<i>wait</i>}>
          <Show />
        </I18nProvider>,
      ));
    });
    // No key warning for the placeholder beside the hidden copy. React warns once per
    // component, so this test runs first in the file.
    expect(warnings).toEqual([]);
    expect(shown(container).textContent).toBe("wait");
    expect(container.querySelector("b[hidden]")!.textContent).toBe("en:hi");
    await l.answer("en:default");
    expect(container.innerHTML).toBe("<p>en:Hello</p>");
  });

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
    expect(shown(container).textContent).toBe("wait");
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

  it("a client render (no hydration): a handover at any depth under a shut `loading` gate hands its catalogs over and opens it, with no request for them", async () => {
    // Beside `loading` the children mount hidden, so an `<I18nHandover catalogs>` anywhere
    // among them adds its payload at commit: the gate opens on it, before any catalog loads.
    const catalogs: ProviderCatalogs = { default: { uk: { hi: "Привіт" } } };
    const Layout = ({ children }: { children: React.ReactNode }) => <main>{children}</main>;
    const shapes: ((x: React.ReactNode) => React.ReactNode)[] = [
      (x) => x,
      (x) => <>{x}</>,
      (x) => <Suspense fallback="…">{x}</Suspense>,
      (x) => <Layout>{x}</Layout>,
      (x) => (
        <Layout>
          <section>
            <Suspense fallback="…">{x}</Suspense>
          </section>
        </Layout>
      ),
    ];
    for (const shape of shapes) {
      const l = manualLoader();
      const { i18n } = make({ locale: "en", loader: l.load }); // en:default in flight
      const { container, unmount } = render(
        <I18nProvider i18n={i18n} loading="wait">
          {shape(
            <I18nHandover locale="uk" catalogs={catalogs}>
              <Show />
            </I18nHandover>,
          )}
        </I18nProvider>,
      );
      expect(container.textContent).toBe("uk:Привіт");
      expect(container.querySelector("[hidden]")).toBeNull();
      await settle();
      expect(i18n.locale).toBe("uk");
      expect(container.textContent).toBe("uk:Привіт");
      expect(l.requested.filter((r) => r.startsWith("uk"))).toEqual([]);
      unmount();
    }
  });

  it("a client render under `suspense`: nothing mounts while the provider suspends, so a handover below waits like any child", async () => {
    // Not covered by the hidden mount (it would not commit under a suspended boundary).
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load }); // en:default in flight
    const catalogs: ProviderCatalogs = { default: { uk: { hi: "Привіт" } } };
    const { container } = render(
      <Suspense fallback="wait">
        <I18nProvider i18n={i18n} suspense>
          <I18nHandover locale="uk" catalogs={catalogs}>
            <Show />
          </I18nHandover>
        </I18nProvider>
      </Suspense>,
    );
    expect(container.textContent).toBe("wait");
    await l.answer("en:default");
    await settle();
    expect(container.textContent).toBe("uk:Привіт");
    expect(l.requested.filter((r) => r.startsWith("uk"))).toEqual([]);
  });

  it("the gate waits only while a namespace has no text at all: inline or fallback text shows at once", async () => {
    const l = manualLoader();
    // Inline English, the French fallback still loading: English text, no placeholder.
    const a = make({
      locale: "en",
      fallbackLocale: "fr",
      messages: { en: { hi: "Hello" } },
      loader: l.load,
    }).i18n;
    expect(l.requested).toContain("fr:default");
    const one = render(
      <I18nProvider i18n={a} loading="wait">
        <Show />
      </I18nProvider>,
    );
    expect(one.container.textContent).toBe("en:Hello");
    // German on screen, its catalog loading, an English fallback in place: the fallback.
    const b = make({
      locale: "de",
      fallbackLocale: "en",
      messages: { en: { hi: "Hello" } },
      loader: l.load,
    }).i18n;
    const two = render(
      <I18nProvider i18n={b} loading="wait">
        <Show />
      </I18nProvider>,
    );
    expect(two.container.textContent).toBe("de:Hello");
  });

  it("hydrates a server render through `loading` on a client instance still loading, whatever wraps the handover (0 mismatches, 0 requests for the payload)", async () => {
    const catalogs: ProviderCatalogs = { default: { uk: { hi: "Привіт" } } };
    const Layout = ({ children }: { children: React.ReactNode }) => <main>{children}</main>;
    const shapes: ((x: React.ReactNode) => React.ReactNode)[] = [
      (x) => x,
      (x) => <>{x}</>,
      (x) => <Suspense fallback="…">{x}</Suspense>,
      (x) => <Layout>{x}</Layout>,
      (x) => (
        <Layout>
          <section>
            <Suspense fallback="…">{x}</Suspense>
          </section>
        </Layout>
      ),
    ];
    const server = createI18n({ locale: "uk", messages: { uk: { hi: "Привіт" } } });
    for (const [shape, suspense] of shapes.flatMap((w) => [
      [w, false],
      [w, true],
    ]) as [(x: React.ReactNode) => React.ReactNode, boolean][]) {
      const ui = (i: ReturnType<typeof createI18n>) => (
        <I18nProvider i18n={i} loading="wait" suspense={suspense}>
          {shape(
            <I18nHandover locale="uk" catalogs={catalogs}>
              <Show />
            </I18nHandover>,
          )}
        </I18nProvider>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(ui(server));
      expect(container.textContent).toBe("uk:Привіт");
      const loader = vi.fn(
        (_l: string, _n: string, _s: AbortSignal) => new Promise<never>(() => {}),
      );
      const client = createI18n({ locale: "en", loader }); // knows nothing yet: en:default loads
      const errors: unknown[] = [];
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, ui(client), {
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
    expect(shown(container).textContent).toBe("");
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
