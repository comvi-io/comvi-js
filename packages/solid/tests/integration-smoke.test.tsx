import { describe, it, expect } from "vitest";
import { render } from "solid-js/web";
import { createI18n } from "@comvi/core";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { T } from "../src/T";

describe("solid integration smoke", () => {
  it("renders with real core and reacts to locale changes", async () => {
    const container = document.createElement("div");
    const i18n = createI18n({
      locale: "en",
      translation: {
        en: { greeting: "Hello" },
        fr: { greeting: "Bonjour" },
      },
    });
    await i18n.init();

    const App = () => {
      const { locale } = useI18n();
      return (
        <div>
          <span data-testid="lang">{locale()}</span>
          <span data-testid="text">
            <T i18nKey={"greeting" as never} />
          </span>
        </div>
      );
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={i18n}>
          <App />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toContain("en");
    expect(container.textContent).toContain("Hello");

    await i18n.setLocaleAsync("fr");
    await Promise.resolve();

    expect(container.textContent).toContain("fr");
    expect(container.textContent).toContain("Bonjour");

    dispose();
  });

  it("loads namespace with real core and exposes it through useI18n", async () => {
    const container = document.createElement("div");
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        en: { hello: "Hello" },
      },
    });
    i18n.registerLoader(async (_language, namespace) => {
      if (namespace === "admin") return { title: "Admin Panel" };
      return {};
    });
    await i18n.init();

    const App = () => {
      const { t } = useI18n();
      return <div>{t("title" as never, { ns: "admin" })}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={i18n}>
          <App />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("title");

    await i18n.addActiveNamespace("admin");
    await Promise.resolve();

    expect(container.textContent).toBe("Admin Panel");

    dispose();
  });

  it("reacts to default namespace changes for useI18n() and <T>", async () => {
    const container = document.createElement("div");
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        "en:common": { title: "Common Title" },
        "en:admin": { title: "Admin Title" },
      },
    });
    await i18n.init();

    const App = () => {
      const { t } = useI18n();
      return (
        <div>
          <span data-testid="hook">{t("title" as never)}</span>
          <span data-testid="component">
            <T i18nKey={"title" as never} />
          </span>
        </div>
      );
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={i18n}>
          <App />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toContain("Common Title");

    i18n.setDefaultNamespace("admin");
    await Promise.resolve();

    expect(container.textContent).toContain("Admin Title");

    dispose();
  });
});
