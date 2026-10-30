/**
 * @comvi/react/format — useFormat() (design §3.3). Ported by meaning from 0.7
 * useFormatters.test.tsx and the formatter cases of useI18n.test.tsx: formatters bound to
 * the render locale, re-rendering on a switch, the instance's timeZone, named formats,
 * rtl and relative time; a handover locale formats in the target.
 */
import { lazy, Suspense, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, type I18n } from "../src";
import { handover } from "../../core/src/internal";
import { useFormat, type Formatters } from "../src/format";

const capture = (i18n: I18n, wrap = (x: React.ReactNode) => x) => {
  const seen: Formatters[] = [];
  const Probe = () => {
    seen.push(useFormat());
    return null;
  };
  render(<I18nProvider i18n={i18n}>{wrap(<Probe />)}</I18nProvider>);
  return () => seen[seen.length - 1];
};

describe("useFormat()", () => {
  it("formats numbers, currency, dates, ranges, lists, names and relative time in the locale", () => {
    const i18n = createI18n({
      locale: "de",
      timeZone: "UTC",
      now: Date.UTC(2026, 0, 10),
      formats: { number: { pct: { style: "percent" } } },
    });
    const raw = capture(i18n)();
    // Intl spaces are narrow / no-break spaces.
    const sp = (s: string | undefined) => s!.replace(/[\u00a0\u202f]/g, " ");
    const f = Object.fromEntries(
      Object.entries(raw).map(([k, fn]) => [
        k,
        (...a: never[]) => sp((fn as (...x: never[]) => string)(...a)),
      ]),
    ) as unknown as Formatters;
    expect(f.number(1234.5)).toBe("1.234,5");
    expect(f.number(0.5, "pct")).toBe("50 %");
    expect(f.currency(9.5, "EUR")).toBe("9,50 €");
    expect(f.date(Date.UTC(2026, 0, 2), { dateStyle: "medium" })).toBe("02.01.2026");
    expect(
      f.dateRange(Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 5), { day: "numeric", month: "numeric" }),
    ).toBe("02.–05.01.");
    expect(f.list(["a", "b", "c"])).toBe("a, b und c");
    expect(f.displayName("en")).toBe("Englisch");
    expect(f.relative(Date.UTC(2026, 0, 9))).toBe("gestern");
    // `now` and Intl's options in one object, like every other formatter (lot 4b).
    expect(f.relative(Date.UTC(2026, 0, 3), { now: Date.UTC(2026, 0, 5), numeric: "always" })).toBe(
      "vor 2 Tagen",
    );
  });

  it("a handed-over serverNow holds for a component's hydration only: late mounts and later renders run live (lot 4b)", async () => {
    const real = Date.now;
    let clockNow = 940_000;
    Date.now = () => clockNow;
    try {
      // 880 000 is "1 minute ago" for the server's render at 940 000.
      const Ago = ({ id }: { id: string }) => <i id={id}>{useFormat().relative(880_000)}</i>;
      const server = createI18n({ locale: "en", timeZone: "UTC" });
      const showLate = false;
      let setLate: (v: boolean) => void = () => {};
      const App = () => {
        const [late, set] = useState(showLate);
        setLate = set;
        return (
          <>
            <Ago id="a" />
            {late && <Ago id="late" />}
          </>
        );
      };
      const page = (i: I18n) => (
        <I18nProvider i18n={i}>
          <App />
        </I18nProvider>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(page(server));
      const payload = handover(server);
      expect(payload.serverNow).toBe(940_000);
      expect(container.textContent).toBe("1 minute ago");
      // The browser hydrates a minute later.
      clockNow = 1_000_000;
      const client = createI18n({ ...payload });
      const recoverable: unknown[] = [];
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const html: string[] = [];
      const obs = new MutationObserver(() => html.push(container.textContent!));
      obs.observe(container, { subtree: true, characterData: true, childList: true });
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, page(client), {
          onRecoverableError: (e) => recoverable.push(e),
        });
      });
      expect(recoverable).toEqual([]);
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
      // React re-renders a hydrated component once after the hydration: it goes live then.
      expect(container.querySelector("#a")!.textContent).toBe("2 minutes ago");
      // A component mounted after the hydration (a client navigation) is live at once: its
      // FIRST render counts from the browser's clock, not from the stale server clock.
      await act(async () => setLate(true));
      expect(container.querySelector("#late")!.textContent).toBe("2 minutes ago");
      // Nothing painted after the hydration counts from the stale server clock.
      expect(html.length).toBeGreaterThan(0);
      expect(html.filter((t) => t.includes("1 minute ago"))).toEqual([]);
      obs.disconnect();
      act(() => root.unmount());
    } finally {
      Date.now = real;
    }
  });

  it("selective hydration: a Suspense boundary hydrated later formats with the server clock in its hydration (lot 4b)", async () => {
    const real = Date.now;
    let clockNow = 970_000;
    Date.now = () => clockNow;
    try {
      // 940 000 is "30 seconds ago" for the server's render at 970 000.
      const Ago = ({ id }: { id: string }) => <i id={id}>{useFormat().relative(940_000)}</i>;
      const server = createI18n({ locale: "en", timeZone: "UTC" });
      let resolve!: (m: { default: typeof Ago }) => void;
      const LazyAgo = lazy(() => new Promise<{ default: typeof Ago }>((y) => (resolve = y)));
      const page = (i: I18n, Late: React.ComponentType<{ id: string }>) => (
        <I18nProvider i18n={i}>
          <Ago id="now" />
          <Suspense fallback="…">
            <Late id="later" />
          </Suspense>
        </I18nProvider>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(page(server, Ago));
      const payload = handover(server);
      expect(container.querySelector("#later")!.textContent).toBe("30 seconds ago");
      clockNow = 970_000 + 3_600_000; // an hour later
      const client = createI18n({ ...payload });
      const recoverable: unknown[] = [];
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, page(client, LazyAgo), {
          onRecoverableError: (e) => recoverable.push(e),
        });
      });
      // The first component hydrated and went live; the boundary is still dehydrated.
      expect(container.querySelector("#now")!.textContent).toBe("1 hour ago");
      expect(container.querySelector("#later")!.textContent).toBe("30 seconds ago");
      await act(async () => resolve({ default: Ago }));
      // Its hydration matched the server's text (no mismatch), then it went live.
      expect(recoverable).toEqual([]);
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
      expect(container.querySelector("#later")!.textContent).toBe("1 hour ago");
      act(() => root.unmount());
    } finally {
      Date.now = real;
    }
  });

  it("activates no namespace: a component that only formats asks the loader for nothing (lot 4b)", async () => {
    const requested: string[] = [];
    const i18n = createI18n({
      locale: "en",
      namespaces: ["shop"],
      loader: async (l, n) => (requested.push(`${l}:${n}`), {}),
    });
    const Price = () => <p>{useFormat().number(1234.5)}</p>;
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <Price />
      </I18nProvider>,
    );
    await act(async () => {});
    expect(container.textContent).toBe("1,234.5");
    expect(requested).toEqual(["en:shop"]);
  });

  it("an explicit `now` option stays fixed in every render (lot 4b)", () => {
    const real = Date.now;
    Date.now = () => 5_000_000;
    try {
      const i18n = createI18n({ locale: "en", now: 940_000, serverNow: 100 });
      expect(capture(i18n)().relative(880_000)).toBe("1 minute ago");
    } finally {
      Date.now = real;
    }
  });

  it("re-renders with new formatters on a locale switch", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: {}, de: {} } });
    const f = capture(i18n);
    expect(f().number(1234.5)).toBe("1,234.5");
    await act(() => i18n.setLocale("de"));
    expect(f().number(1234.5)).toBe("1.234,5");
  });

  it("a formatter kept from an earlier render keeps that render's locale, like its t", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: {}, de: {} } });
    const f = capture(i18n);
    const kept = f();
    await act(() => i18n.setLocale("de"));
    expect(kept.number(1234.5)).toBe("1,234.5");
    expect(f().number(1234.5)).toBe("1.234,5");
  });

  it("walks the configured fallback chain when the runtime lacks the locale, like the core (lot 4d)", () => {
    const i18n = createI18n({ locale: "xx", fallbackLocale: "de", messages: { xx: {} } });
    expect(capture(i18n)().number(1234.5)).toBe(new Intl.NumberFormat("de").format(1234.5));
  });

  it("a handover target the runtime lacks formats in ITS chain, not the instance's (lot 4d)", () => {
    // The render shows xx (chain xx → de) while the instance stays on fr (chain fr → de):
    // xx's catalog never lands, so the instance does not switch.
    const i18n = createI18n({
      locale: "fr",
      fallbackLocale: "de",
      messages: { fr: {} },
      loader: () => new Promise<never>(() => {}),
    });
    const f = capture(i18n, (x) => <I18nHandover locale="xx">{x}</I18nHandover>);
    expect(i18n.locale).toBe("fr");
    expect(f().number(1234.5)).toBe(new Intl.NumberFormat("de").format(1234.5));
  });

  it("formats in the target locale of an <I18nHandover> before the instance switches", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } });
    const f = capture(i18n, (x) => <I18nHandover locale="de">{x}</I18nHandover>);
    expect(f().number(1234.5)).toBe("1.234,5");
  });
});
