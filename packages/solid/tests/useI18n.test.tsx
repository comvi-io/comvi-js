import { describe, it, expect, vi } from "vitest";
import { render } from "solid-js/web";
import { createI18n } from "@comvi/core";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

describe("useI18n", () => {
  it("throws when used outside provider", () => {
    const container = document.createElement("div");
    const Bad = () => {
      useI18n();
      return null;
    };

    expect(() => render(() => <Bad />, container)).toThrow(
      "[@comvi/solid] i18n context not found.",
    );
  });

  it("binds a default namespace and still allows an explicit override", async () => {
    const container = document.createElement("div");
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        "en:admin": { title: "Admin Title" },
        "en:custom": { title: "Custom Title" },
      },
    });
    await i18n.init();

    let api!: ReturnType<typeof useI18n<"admin">>;
    const Probe = () => {
      api = useI18n("admin");
      return <div>{api.t("title" as never)}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={i18n} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("Admin Title");
    expect(api.t("title" as never, { ns: "custom" } as never)).toBe("Custom Title");

    dispose();
  });

  it("returns plain text via t() and preserves structure via tRaw()", () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.tImplementation = () => [
      "Start ",
      { type: "element", tag: "strong", props: {}, children: ["middle"] },
      " end",
    ];

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div>{api.t("rich" as never)}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("Start middle end");
    expect(api.tRaw("rich" as never)).toEqual([
      "Start ",
      { type: "element", tag: "strong", props: {}, children: ["middle"] },
      " end",
    ]);

    dispose();
  });

  it("reactively exposes locale, loading, initialization, and cache state", async () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });

    const Probe = () => {
      const api = useI18n();
      return (
        <div>
          {api.locale()}|{String(api.isLoading())}|{String(api.isInitializing())}|
          {String(api.isInitialized())}|{String(api.cacheRevision())}
        </div>
      );
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("en|false|false|false|0");

    fake.emit("loadingStateChanged", { isLoading: true, isInitializing: true });
    await Promise.resolve();
    expect(container.textContent).toBe("en|true|true|false|0");

    await fake.setLocaleAsync("fr");
    fake.addTranslations({ fr: { greeting: "Bonjour" } });
    fake.isInitialized = true;
    fake.emit("initialized", undefined);
    fake.emit("loadingStateChanged", { isLoading: false, isInitializing: false });
    await Promise.resolve();

    expect(container.textContent).toBe("fr|false|false|true|1");

    dispose();
  });

  it("changes language and exposes translation metadata through the returned API", async () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({
      en: { greeting: "Hello" },
      fr: { greeting: "Bonjour" },
    });

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return (
        <div>
          {api.locale()}|{api.t("greeting" as never)}
        </div>
      );
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("en|Hello");

    await api.setLocale("fr");
    await Promise.resolve();
    expect(container.textContent).toBe("fr|Bonjour");

    api.addTranslations({ fr: { farewell: "Au revoir" } });
    expect(api.hasLocale("fr", "common")).toBe(true);
    expect(api.hasTranslation("farewell", "fr", "common", true)).toBe(true);
    expect(api.getLoadedLocales().sort()).toEqual(["en", "fr"]);
    expect(api.getActiveNamespaces()).toContain("common");
    expect(api.getDefaultNamespace()).toBe("common");

    dispose();
  });

  it("loads namespaces and reloads translations through the public hook API", async () => {
    const container = document.createElement("div");
    let commonTitle = "Common Title v1";
    const adminTitle = "Admin Title v1";
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        "en:common": { title: commonTitle },
      },
    });

    i18n.registerLoader(async (_language, namespace) => {
      if (namespace === "common") {
        return { title: commonTitle };
      }
      if (namespace === "admin") {
        return { title: adminTitle };
      }
      return {};
    });

    await i18n.init();

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return (
        <div>
          {api.t("title" as never)}|{api.t("title" as never, { ns: "admin" } as never)}
        </div>
      );
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={i18n} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("Common Title v1|title");

    await api.addActiveNamespace("admin");
    await vi.waitFor(() => {
      expect(container.textContent).toBe("Common Title v1|Admin Title v1");
    });

    commonTitle = "Common Title v2";
    await api.reloadTranslations("en", "common");
    await vi.waitFor(() => {
      expect(container.textContent).toBe("Common Title v2|Admin Title v1");
    });

    dispose();
  });

  it("supports fallback locales and missing-key handlers", async () => {
    const container = document.createElement("div");
    const i18n = createI18n({
      locale: "es",
      defaultNs: "common",
      translation: {
        "fr:common": { hello: "Bonjour" },
      },
    });

    await i18n.init();

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div>{api.t("hello" as never)}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={i18n} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("hello");

    api.setFallbackLocale("fr");
    expect(api.t("hello" as never)).toBe("Bonjour");

    const unsubscribe = api.onMissingKey((key) => `Missing: ${key}`);
    expect(api.t("unknown" as never)).toBe("Missing: unknown");

    unsubscribe();
    expect(api.t("unknown" as never)).toBe("unknown");

    dispose();
  });

  it("surfaces load errors through the returned callbacks", async () => {
    const container = document.createElement("div");
    const i18n = createI18n({ locale: "en", defaultNs: "common" });
    i18n.registerLoader(async (_language, namespace) => {
      if (namespace === "admin") {
        throw new Error("admin namespace failed");
      }
      return {};
    });
    await i18n.init();

    let api!: ReturnType<typeof useI18n>;
    const loadErrors: Array<{ language: string; namespace: string; message: string }> = [];
    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={i18n} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    const unsubscribe = api.onLoadError((language, namespace, error) => {
      loadErrors.push({ language, namespace, message: error.message });
    });

    await expect(api.addActiveNamespace("admin")).rejects.toThrow();
    expect(loadErrors).toEqual([
      {
        language: "en",
        namespace: "admin",
        message: "admin namespace failed",
      },
    ]);

    unsubscribe();
    dispose();
  });

  it("exposes formatting methods that use the current language", () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    const num = api.formatNumber(1234.5);
    expect(num).toContain("1");
    expect(num.length).toBeGreaterThan(1);

    const date = api.formatDate(new Date(2026, 0, 1));
    expect(date).toContain("2026");

    const currency = api.formatCurrency(9.99, "USD");
    expect(currency).toContain("9.99");

    const relative = api.formatRelativeTime(-1, "day");
    expect(relative.length).toBeGreaterThan(0);

    dispose();
  });

  it("exposes dir() that reflects the current language direction", async () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });

    const Probe = () => {
      const { dir } = useI18n();
      return <div>{dir()}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("ltr");

    await fake.setLocaleAsync("ar");
    await Promise.resolve();

    expect(container.textContent).toBe("rtl");

    dispose();
  });

  it("supports on() subscriptions with unsubscribe", async () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });
    const seen: string[] = [];
    let api!: ReturnType<typeof useI18n>;

    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    const unsubscribe = api.on("localeChanged", ({ to }) => {
      seen.push(to);
    });

    await fake.setLocaleAsync("fr");
    expect(seen).toEqual(["fr"]);

    unsubscribe();
    await fake.setLocaleAsync("de");
    expect(seen).toEqual(["fr"]);

    dispose();
  });
});
