// framework-slim P5 step 3 — the documented client recipe end to end.
//
// The server loads (createNextI18nFromHost + loadTranslations, covered in
// createNextI18nFromHost.test.ts); the client pays the bare-slim price and is
// hydrated from the serialized catalog through `<I18nProvider messages>`.
// This is exactly the graph `fw-next-client-slim` measures — core's base root
// and react's bindings, and nothing else: no loader, no tag machinery, none of
// next's server modules.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { act, renderHook } from "@testing-library/react";
import { createI18n } from "@comvi/core";
import type { WrapperI18nHost } from "@comvi/core";
import { useI18n } from "../src/client";
import { I18nProvider } from "../src/client/I18nProvider";
import type { MessagesMap } from "../src/client/I18nProvider";

const bareSlimClient = (): WrapperI18nHost => createI18n({ locale: "en", exposeGlobal: false });

const hydrated = (
  i18n: WrapperI18nHost,
  locale: string,
  messages: MessagesMap,
  children: React.ReactNode,
) => (
  <I18nProvider i18n={i18n} locale={locale} messages={messages} autoInit={false}>
    {children}
  </I18nProvider>
);

const MESSAGES: MessagesMap = { "fr:default": { greeting: "Bonjour" } };

describe("next client on a bare @comvi/core host", () => {
  it("translates from a server-serialized catalog", () => {
    const i18n = bareSlimClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      hydrated(i18n, "fr", MESSAGES, children);

    const { t, locale } = renderHook(() => useI18n(), { wrapper }).result.current;

    expect(locale).toBe("fr");
    expect(t("greeting" as never)).toBe("Bonjour");
  });

  it("has no loader or plugin capability to bind", () => {
    const i18n = bareSlimClient() as unknown as Record<string, unknown>;

    expect(i18n.reloadTranslations).toBeUndefined();
    expect(i18n.use).toBeUndefined();
  });
});

describe("next client-slim hydration round-trip", () => {
  let errorSpy: MockInstance;
  let warnSpy: MockInstance;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("renders on the server and hydrates on the client without warnings", async () => {
    const content = <span data-testid="greeting">static</span>;

    const html = renderToString(hydrated(bareSlimClient(), "fr", MESSAGES, content));
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    let root!: Root;
    await act(async () => {
      root = hydrateRoot(container, hydrated(bareSlimClient(), "fr", MESSAGES, content));
    });

    expect(container.textContent).toContain("static");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
