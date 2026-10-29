/**
 * Lot 4b completion criterion (owner brief 29.10): the README's React app behaves
 * predictably on success, a slow load, an error, a fast double switch and a hydration. The
 * components are the README's (`App` with its `<select>`, a `<T>` with `components`), the
 * loader stands for `cdn()`. No case may leave an unhandled rejection or a raw key the
 * contract does not name.
 */
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, T, useI18n, type I18n } from "../src";
import { handover } from "../../core/src/internal";
import { manualLoader, settle } from "./helpers";

const CATALOGS = {
  "en:default": {
    greeting: "Hello, {name}!",
    terms: "Read the <link>terms</link>, <b>in <i>full</i></b>.",
  },
  "uk:default": {
    greeting: "Привіт, {name}!",
    terms: "Прочитайте <link>умови</link>, <b>усі <i>повністю</i></b>.",
  },
  "de:default": {
    greeting: "Hallo, {name}!",
    terms: "Lies die <link>AGB</link>, <b>ganz <i>vollständig</i></b>.",
  },
};

/** The README's `src/App.tsx`, plus its markup example. */
function App() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <select value={locale} onChange={(e) => setLocale(e.target.value).catch(() => {})}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
        <option value="de">Deutsch</option>
      </select>
      <p>
        <T
          i18nKey="terms"
          link={(chunks) => <a href="/terms">{chunks}</a>}
          components={{ b: "strong", i: "em" }}
        />
      </p>
    </>
  );
}

const ui = (i18n: I18n) => (
  <I18nProvider i18n={i18n} loading={<div className="spinner" />}>
    <App />
  </I18nProvider>
);

let rejections: unknown[] = [];
const onRejection = (e: unknown) => rejections.push(e);
beforeEach(() => {
  rejections = [];
  process.on("unhandledRejection", onRejection);
});
afterEach(async () => {
  await new Promise((y) => setTimeout(y, 0));
  process.off("unhandledRejection", onRejection);
  expect(rejections).toEqual([]);
});

const start = () => {
  const l = manualLoader(CATALOGS);
  const errors: string[] = [];
  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    loader: l.load,
    onError: (e) => errors.push(`${e.code} ${e.locale}`),
  });
  const view = render(ui(i18n));
  const h1 = () => view.container.querySelector("h1")?.textContent;
  const select = () => view.container.querySelector("select")!;
  const terms = () => view.container.querySelector("p")?.innerHTML;
  const pick = (v: string) => act(() => void fireEvent.change(select(), { target: { value: v } }));
  return { l, i18n, view, h1, select, terms, pick, errors };
};

describe("README React app (lot 4b)", () => {
  it("success: the spinner until the first catalogs, then the text; a switch in place", async () => {
    const s = start();
    expect(s.view.container.innerHTML).toBe('<div class="spinner"></div>');
    await s.l.answer("en:default");
    expect(s.h1()).toBe("Hello, Alice!");
    expect(s.terms()).toBe(
      'Read the <a href="/terms">terms</a>, <strong>in <em>full</em></strong>.',
    );
    await s.pick("uk");
    await s.l.answer("uk:default");
    expect([s.h1(), s.select().value]).toEqual(["Привіт, Alice!", "uk"]);
    expect(s.errors).toEqual([]);
  });

  it("slow load: the old locale stays on screen (text and control) until the new one is in", async () => {
    const s = start();
    await s.l.answer("en:default");
    await s.pick("uk");
    expect([s.h1(), s.select().value, s.i18n.locale]).toEqual(["Hello, Alice!", "en", "en"]);
    await s.l.answer("uk:default");
    expect([s.h1(), s.select().value]).toEqual(["Привіт, Alice!", "uk"]);
  });

  it("error: a failed switch keeps the locale, reports load_failed, rejects nothing unhandled", async () => {
    const s = start();
    await s.l.answer("en:default");
    await s.pick("de");
    await s.l.fail("de:default");
    await settle();
    expect([s.h1(), s.select().value, s.i18n.locale]).toEqual(["Hello, Alice!", "en", "en"]);
    expect(s.errors).toEqual(["load_failed de"]);
  });

  it("error on the first load: the gate opens with the keys, no spinner forever", async () => {
    const s = start();
    await s.l.fail("en:default");
    // The contract's "missing" text: the key, reported (the catalog will not come).
    expect(s.h1()).toBe("greeting");
    expect(s.errors[0]).toBe("load_failed en");
    expect(new Set(s.errors.slice(1))).toEqual(new Set(["missing_key en"]));
  });

  it("fast double switch: the last one wins, the earlier never shows", async () => {
    const s = start();
    await s.l.answer("en:default");
    await s.pick("uk");
    await s.pick("de");
    expect(s.l.signals.get("uk:default")!.aborted).toBe(true);
    await s.l.answer("de:default");
    expect([s.h1(), s.select().value]).toEqual(["Hallo, Alice!", "de"]);
    expect(s.errors).toEqual([]);
  });

  it("hydration: the server's text, 0 mismatches, 0 catalog requests (the README's seeded client)", async () => {
    const server = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      catalogs: { default: { uk: CATALOGS["uk:default"], en: CATALOGS["en:default"] } },
    });
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui(server));
    const html = container.innerHTML;
    expect(container.querySelector("h1")!.textContent).toBe("Привіт, Alice!");
    // The page embeds handover(server); the browser's instance starts from it (README).
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const l = manualLoader(CATALOGS);
    const client = createI18n({ locale: "en", fallbackLocale: "en", loader: l.load, ...payload });
    expect(client.locale).toBe("uk");
    const recoverable: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, ui(client), {
        onRecoverableError: (e) => recoverable.push(e),
      });
    });
    await settle();
    expect(recoverable).toEqual([]);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
    expect(container.innerHTML).toBe(html);
    // R3-21: nothing is asked for after the hydration.
    expect(l.requested).toEqual([]);
    // The app goes on: a switch loads what the payload did not carry.
    await act(
      async () =>
        void fireEvent.change(container.querySelector("select")!, { target: { value: "de" } }),
    );
    await l.answer("de:default");
    expect(container.querySelector("h1")!.textContent).toBe("Hallo, Alice!");
    expect(l.requested).toEqual(["de:default"]);
    act(() => root.unmount());
  });

  it("hydration through <I18nHandover> props on a client that is still loading: the server's text, 0 mismatches, nothing asked of what the server sent", async () => {
    const server = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      catalogs: { default: { uk: CATALOGS["uk:default"], en: CATALOGS["en:default"] } },
    });
    const payload = handover(server);
    const page = (i: I18n) => (
      <I18nProvider i18n={i} loading={<div className="spinner" />}>
        <I18nHandover locale={payload.locale} catalogs={payload.catalogs as never}>
          <App />
        </I18nHandover>
      </I18nProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(page(server));
    const html = container.innerHTML;
    // A client made before the payload is known (a module instance): its startup load of
    // en:default is its own, not one of the hydration's.
    const l = manualLoader(CATALOGS);
    const client = createI18n({ locale: "en", fallbackLocale: "en", loader: l.load });
    expect(l.requested).toEqual(["en:default"]);
    const recoverable: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, page(client), {
        onRecoverableError: (e) => recoverable.push(e),
      });
    });
    await settle();
    expect(recoverable).toEqual([]);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
    expect(container.innerHTML).toBe(html);
    await l.answer("en:default");
    expect(client.locale).toBe("uk");
    expect(container.innerHTML).toBe(html);
    expect(l.requested).toEqual(["en:default"]); // nothing after the hydration
    act(() => root.unmount());
  });
});
