import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import { createI18n } from "../src";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { T } from "../src/T";
import { createDeferred, setLocale } from "./test-utils";

// Type declarations for test translation keys
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
          <button data-testid="btn-fr" onClick={async () => await setLocale(i18n, "fr")}>
            Fr
          </button>
          <button data-testid="btn-en" onClick={async () => await setLocale(i18n, "en")}>
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

    screen.getByTestId("btn-fr").click();

    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Bienvenue");
      expect(screen.getByTestId("lang").textContent).toBe("fr");
      expect(screen.getByTestId("switch-text").textContent).toBe("Changer de langue");
    });

    screen.getByTestId("btn-en").click();

    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Welcome");
      expect(screen.getByTestId("lang").textContent).toBe("en");
    });
  });

  it("loads a dynamic namespace and updates loading state", async () => {
    const deferred = createDeferred<Record<string, string>>();
    const loader = vi.fn(() => deferred.promise);

    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        en: { home: "Home", loading: "Loading..." },
      },
    });

    i18n.use((i18n) => {
      i18n.registerLoader((locale, namespace) => loader(locale, namespace));
    });

    await i18n.init();

    const App = () => {
      const { t, isLoading, addActiveNamespace } = useI18n();
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
      screen.getByTestId("load").click();
    });

    // While the deferred is pending, verify loading indicator is shown
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("Loading...");
    });

    deferred.resolve({ title: "Dashboard" });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard").textContent).toBe("Dashboard");
    });
  });
});
