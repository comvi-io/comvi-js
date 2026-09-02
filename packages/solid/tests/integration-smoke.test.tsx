import { describe, it, expect } from "vitest";
import { attachLoader, createI18n } from "../src/index";
import type { LoaderResult } from "@comvi/core/loader";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { T } from "../src/T";
import { flushMicrotasks, renderSolid } from "./test-utils";

describe("solid integration smoke", () => {
  it("renders with real core and reacts to locale changes", async () => {
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

    const container = renderSolid(() => (
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("enHello");

    await i18n.setLocaleAsync("fr");
    await flushMicrotasks();

    expect(container.textContent).toBe("frBonjour");
  });

  it("loads namespace with real core and exposes it through useI18n", async () => {
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        en: { hello: "Hello" },
      },
      // `attachLoader` rather than `loader()`: this drives a raw `LoaderFn`.
    }).with(attachLoader);
    i18n.registerLoader(async (_language, namespace): Promise<LoaderResult> => {
      if (namespace === "admin") return { title: "Admin Panel" };
      return {};
    });
    await i18n.init();

    const App = () => {
      const { t } = useI18n();
      return <div>{t("title" as never, { ns: "admin" })}</div>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("title");

    await i18n.addActiveNamespace("admin");
    await flushMicrotasks();

    expect(container.textContent).toBe("Admin Panel");
  });

  it("reacts to default namespace changes for useI18n() and <T>", async () => {
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

    const container = renderSolid(() => (
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("Common TitleCommon Title");

    i18n.setDefaultNamespace("admin");
    await flushMicrotasks();

    expect(container.textContent).toBe("Admin TitleAdmin Title");
  });
});
