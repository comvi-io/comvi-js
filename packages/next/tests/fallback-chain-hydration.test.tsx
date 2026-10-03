/**
 * The client half of the server fallback-chain contract: what the server could
 * read for a render reaches `<I18nProvider messages>`, so a key the server
 * resolved from a fallback catalog renders the same text after hydration and
 * after a client navigation. A fallback that failed to load is absent on both
 * sides, so the two still agree.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";

import { createI18n, T } from "@comvi/react";
import { I18nProvider } from "../src/client/I18nProvider";
import { createNextI18n } from "../src/createNextI18n";
import { _resetServerI18n, setI18n } from "../src/server/cache";
import { getI18n } from "../src/server/getI18n";
import { loadTranslations } from "../src/server/loadTranslations";
import { spyOnConsoleError } from "./helpers/consoleWarnings";

const CATALOGS: Record<string, Record<string, string>> = {
  "en:common": { greeting: "Hello" },
  "de:common": { greeting: "Hallo", onlyDe: "Nur Deutsch" },
  "fr:common": { greeting: "Bonjour" },
  "uk:common": { greeting: "Привіт" },
};

const createServerHost = (failing: ReadonlySet<string> = new Set()) => {
  const { i18n } = createNextI18n({
    locales: ["en", "de", "fr", "uk"],
    defaultLocale: "en",
    fallbackLocale: "de",
    defaultNs: "common",
    devMode: false,
  });
  i18n.registerLoader(async (locale: string, ns: string) => {
    if (failing.has(`${locale}:${ns}`)) throw new Error(`offline ${locale}:${ns}`);
    return CATALOGS[`${locale}:${ns}`] ?? {};
  });
  setI18n(i18n);
  return i18n;
};

type Messages = Awaited<ReturnType<typeof loadTranslations>>;

// The client host shares the server's `fallbackLocale`, as the documented setup
// (one `createNextI18n` instance on both sides) does. No loader: it renders
// from `messages` alone.
const createClientHost = () =>
  createI18n({ locale: "en", fallbackLocale: "de", defaultNs: "common", devMode: false });

const Tree = ({
  i18n,
  locale,
  messages,
}: {
  i18n: ReturnType<typeof createClientHost>;
  locale: string;
  messages: Messages;
}) => (
  <I18nProvider i18n={i18n} locale={locale} messages={messages} autoInit={false}>
    <span>
      <T i18nKey={"onlyDe" as never} />
    </span>
  </I18nProvider>
);

const mount = (html: string) => {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
};

describe("SSR → hydration → client navigation with a fallback-only key", () => {
  afterEach(() => {
    _resetServerI18n();
    document.body.innerHTML = "";
  });

  it("the client receives the fallback catalogs and renders what the server rendered", async () => {
    const errorSpy = spyOnConsoleError();
    createServerHost();

    // A Server Component translated first; the layout then loads the messages.
    const { t } = await getI18n({ locale: "fr" });
    const messages = await loadTranslations("fr");
    expect(Object.keys(messages).sort()).toEqual(["de:common", "fr:common"]);
    expect(t("onlyDe")).toBe("Nur Deutsch");

    const html = renderToString(<Tree i18n={createClientHost()} locale="fr" messages={messages} />);
    expect(html).toContain("Nur Deutsch");

    const container = mount(html);
    const client = createClientHost();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Tree i18n={client} locale="fr" messages={messages} />);
    });
    expect(container.textContent).toBe("Nur Deutsch");
    expect(errorSpy).not.toHaveBeenCalled();

    // Client navigation to another locale whose catalog lacks the key.
    const ukMessages = await loadTranslations("uk");
    expect(Object.keys(ukMessages).sort()).toEqual(["de:common", "uk:common"]);
    await act(async () => {
      root.render(<Tree i18n={client} locale="uk" messages={ukMessages} />);
    });
    expect(container.textContent).toBe("Nur Deutsch");
    expect(errorSpy).not.toHaveBeenCalled();
    root.unmount();
  });

  it("a fallback that failed to load → server and client agree on the raw key", async () => {
    const errorSpy = spyOnConsoleError();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createServerHost(new Set(["de:common"]));

    const { t } = await getI18n({ locale: "fr" });
    const messages = await loadTranslations("fr");
    expect(Object.keys(messages)).toEqual(["fr:common"]);
    expect(t("onlyDe")).toBe("onlyDe");

    const html = renderToString(<Tree i18n={createClientHost()} locale="fr" messages={messages} />);
    const container = mount(html);
    await act(async () => {
      hydrateRoot(container, <Tree i18n={createClientHost()} locale="fr" messages={messages} />);
    });

    expect(container.textContent).toBe("onlyDe");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
