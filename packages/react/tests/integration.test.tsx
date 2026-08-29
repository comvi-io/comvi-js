import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { useEffect, useState } from "react";
import { attachLoader, createI18n } from "../src/index";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { useI18nLoader } from "../src/capabilityHooks";
import { T } from "../src/T";
import { createDeferred } from "./test-utils";

declare module "@comvi/core" {
  interface TranslationKeys {
    title: never;
    switchLang: never;
    home: never;
    loading: never;
  }
}

describe("Integration Tests", () => {
  it("handles a language switcher workflow (hook + T)", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: { title: "Welcome", switchLang: "Switch Language" },
        fr: { title: "Bienvenue", switchLang: "Changer de langue" },
      },
    });
    await i18n.init();

    const App = () => {
      const { t, locale } = useI18n();
      return (
        <div>
          <h1 data-testid="title">
            <T i18nKey="title" />
          </h1>
          <div data-testid="lang">{locale}</div>
          <button data-testid="btn-fr" onClick={() => void i18n.setLocaleAsync("fr")}>
            Fr
          </button>
          <button data-testid="btn-en" onClick={() => void i18n.setLocaleAsync("en")}>
            En
          </button>
          <div data-testid="switch-text">{t("switchLang")}</div>
        </div>
      );
    };

    render(
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>,
    );

    expect(screen.getByTestId("title").textContent).toBe("Welcome");
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("switch-text").textContent).toBe("Switch Language");

    fireEvent.click(screen.getByTestId("btn-fr"));

    await waitFor(() => {
      expect(screen.getByTestId("lang").textContent).toBe("fr");
    });
    expect(screen.getByTestId("title").textContent).toBe("Bienvenue");
    expect(screen.getByTestId("switch-text").textContent).toBe("Changer de langue");

    fireEvent.click(screen.getByTestId("btn-en"));

    await waitFor(() => {
      expect(screen.getByTestId("lang").textContent).toBe("en");
    });
    expect(screen.getByTestId("title").textContent).toBe("Welcome");
    expect(screen.getByTestId("switch-text").textContent).toBe("Switch Language");
  });

  it("loads a dynamic namespace and updates loading state", async () => {
    const deferred = createDeferred<Record<string, string>>();
    const loader = vi.fn(() => deferred.promise);

    // `attachLoader` rather than `loader()`: this registers a raw `LoaderFn`,
    // not an import map.
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        en: { home: "Home", loading: "Loading..." },
      },
    }).with(attachLoader);

    i18n.registerLoader((locale, namespace) => loader(locale, namespace));

    await i18n.init();

    const App = () => {
      const { t, isLoading } = useI18n();
      const { addActiveNamespace } = useI18nLoader();
      const [showDashboard, setShowDashboard] = useState(false);

      const loadDashboard = async () => {
        await addActiveNamespace("dashboard");
        setShowDashboard(true);
      };

      return (
        <div>
          <div data-testid="home">{t("home")}</div>
          {isLoading && <div data-testid="loading">{t("loading")}</div>}
          <button data-testid="load" onClick={loadDashboard}>
            Load
          </button>
          {showDashboard && <div data-testid="dashboard">{t("title", { ns: "dashboard" })}</div>}
        </div>
      );
    };

    render(
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>,
    );

    expect(screen.getByTestId("home").textContent).toBe("Home");

    await act(async () => {
      fireEvent.click(screen.getByTestId("load"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("Loading...");
    });

    deferred.resolve({ title: "Dashboard" });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard").textContent).toBe("Dashboard");
    });
  });

  it("clears the loading state and reports the failure when a namespace load rejects", async () => {
    const deferred = createDeferred<Record<string, string>>();
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: { en: { home: "Home", loading: "Loading..." } },
    }).with(attachLoader);

    i18n.registerLoader(() => deferred.promise);

    await i18n.init();

    const loadErrors: string[] = [];

    const App = () => {
      const { isLoading } = useI18n();
      const { addActiveNamespace, onLoadError } = useI18nLoader();
      useEffect(() => onLoadError((_l, ns) => loadErrors.push(ns)), [onLoadError]);

      return (
        <div>
          <div data-testid="state">{isLoading ? "loading" : "idle"}</div>
          <button
            data-testid="load"
            onClick={() => {
              void addActiveNamespace("dashboard").catch(() => {});
            }}
          >
            Load
          </button>
        </div>
      );
    };

    render(
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("load"));
    });

    expect(screen.getByTestId("state").textContent).toBe("loading");

    await act(async () => {
      deferred.reject(new Error("catalog 500"));
      await deferred.promise.catch(() => {});
    });

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe("idle");
    });
    expect(loadErrors).toEqual(["dashboard"]);
  });
});
