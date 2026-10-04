import { describe, it, expect, vi } from "vitest";
import { createMemo } from "solid-js";
import { render } from "solid-js/web";
import { attachLoader, createI18n, icuCompiler } from "../src/index";
import { attachPlugins } from "@comvi/core/plugins";
import type { WrapperI18nHost } from "@comvi/core";
import type { LoaderResult } from "@comvi/core/loader";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { useI18nLoader, useI18nPlugins } from "../src/capabilityHooks";
import type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "../src/capabilityHooks";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { flushMicrotasks, renderSolid } from "./test-utils";

/** A base host whose only catalog is `fr:common`, plus the plugins capability. */
const mountFallbackHost = async () => {
  const i18n = createI18n({
    locale: "es",
    defaultNs: "common",
    translation: { "fr:common": { hello: "Bonjour" } },
  }).use(attachPlugins);

  await i18n.init();

  let api!: ReturnType<typeof useI18n>;
  let plugins!: UseI18nPluginsReturn;
  const Probe = () => {
    api = useI18n();
    plugins = useI18nPlugins();
    return <div>{api.t("hello" as never)}</div>;
  };

  const container = renderSolid(() => (
    <I18nProvider i18n={i18n} autoInit={false}>
      <Probe />
    </I18nProvider>
  ));

  return { api, plugins, container };
};

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

    const container = renderSolid(() => (
      <I18nProvider i18n={i18n} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("Admin Title");
    expect(api.t("title" as never, { ns: "custom" } as never)).toBe("Custom Title");
  });

  it("returns plain text via t() and preserves structure via tRaw()", () => {
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

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("Start middle end");
    expect(api.tRaw("rich" as never)).toEqual([
      "Start ",
      { type: "element", tag: "strong", props: {}, children: ["middle"] },
      " end",
    ]);
  });

  it("exposes reactive defaultParams and setDefaultParams", async () => {
    const i18n = createI18n({
      locale: "en",
      // `{…, select, …}` is ICU: the base host does not compile it unless the
      // app asks, and this one asks in the same call.
      compiler: icuCompiler,
      defaultParams: { formality: "formal" as const },
      translation: {
        en: { review: "{formality, select, formal {Formal} other {Informal}}" },
      },
    });

    let api!: ReturnType<typeof useI18n<undefined, { formality: "formal" | "informal" }>>;
    const Probe = () => {
      api = useI18n<undefined, { formality: "formal" | "informal" }>();
      return (
        <div>
          {api.t("review" as never)}-{api.defaultParams()?.formality as string}
        </div>
      );
    };
    // `I18nProvider`'s `i18n` prop is `WrapperI18nHost<{}>`, not
    // `WrapperI18nHost<D>`, and `setDefaultParams` makes the host invariant in
    // `D`, so no `createI18n({ defaultParams })` instance is assignable to it.
    // The cast stands in until the prop is generic over the defaults type.
    const container = renderSolid(() => (
      <I18nProvider i18n={i18n as unknown as WrapperI18nHost} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("Formal-formal");

    api.setDefaultParams({ formality: "informal" });
    await flushMicrotasks();

    expect(container.textContent).toBe("Informal-informal");
  });

  it("reactively exposes locale, loading, initialization, and cache state", async () => {
    const fake = new FakeI18n({ language: "en" });

    const Probe = () => {
      const api = useI18n();
      return (
        <div>
          <span data-testid="state">
            {api.locale()}|{String(api.isLoading())}|{String(api.isInitializing())}|
            {String(api.isInitialized())}
          </span>
          <span data-testid="revision">{String(api.cacheRevision())}</span>
        </div>
      );
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));
    const state = container.querySelector('[data-testid="state"]')!;
    const revision = container.querySelector('[data-testid="revision"]')!;

    expect(state.textContent).toBe("en|false|false|false");
    expect(revision.textContent).toBe("0");

    fake.emit("loadingStateChanged", { isLoading: true, isInitializing: true });
    await flushMicrotasks();

    expect(state.textContent).toBe("en|true|true|false");
    // The loading axis deliberately does NOT bump the cache revision.
    expect(revision.textContent).toBe("0");

    await fake.setLocale("fr");
    fake.addTranslations({ fr: { greeting: "Bonjour" } });
    fake.isInitialized = true;
    fake.emit("initialized", undefined);
    fake.emit("loadingStateChanged", { isLoading: false, isInitializing: false });
    await flushMicrotasks();

    expect(state.textContent).toBe("fr|false|false|true");
    // Exactly two bumps for the three events: `initialized` re-reads an
    // unchanged cache and must not add a third.
    expect(revision.textContent).toBe("2");
  });

  it("changes language through the returned API and re-renders the subtree", async () => {
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

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("en|Hello");

    await api.setLocale("fr");
    await flushMicrotasks();

    expect(container.textContent).toBe("fr|Bonjour");
  });

  it("exposes catalog metadata for what has been loaded", () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({
      en: { greeting: "Hello" },
      fr: { greeting: "Bonjour" },
    });

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    api.addTranslations({ fr: { farewell: "Au revoir" } });

    expect(api.hasLocale("fr", "common")).toBe(true);
    expect(api.hasTranslation("farewell", "fr", "common", true)).toBe(true);
    expect(api.getLoadedLocales().sort()).toEqual(["en", "fr"]);
    expect(api.getActiveNamespaces()).toContain("common");
    expect(api.getDefaultNamespace()).toBe("common");
  });

  it("loads namespaces and reloads translations through the public hook API", async () => {
    let commonTitle = "Common Title v1";
    const adminTitle = "Admin Title v1";
    const i18n = createI18n({
      locale: "en",
      defaultNs: "common",
      translation: {
        "en:common": { title: commonTitle },
      },
      // `attachLoader` rather than `loader(map)`: this registers a raw `LoaderFn`.
    }).use(attachLoader);

    i18n.registerLoader(async (_language, namespace): Promise<LoaderResult> => {
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
    let loader!: UseI18nLoaderReturn;
    const Probe = () => {
      api = useI18n();
      loader = useI18nLoader();
      return (
        <div>
          {api.t("title" as never)}|{api.t("title" as never, { ns: "admin" } as never)}
        </div>
      );
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={i18n} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("Common Title v1|title");

    await loader.addActiveNamespace("admin");
    await vi.waitFor(() => {
      expect(container.textContent).toBe("Common Title v1|Admin Title v1");
    });

    commonTitle = "Common Title v2";
    await loader.reloadTranslations("en", "common");
    await vi.waitFor(() => {
      expect(container.textContent).toBe("Common Title v2|Admin Title v1");
    });
  });

  it("supports fallback locales and missing-key handlers", async () => {
    const { api } = await mountFallbackHost();

    expect(api.t("hello" as never)).toBe("hello");

    api.setFallbackLocale("fr");

    expect(api.t("hello" as never)).toBe("Bonjour");
  });

  it("routes a missing key to the registered handler until it unsubscribes", async () => {
    const { api, plugins } = await mountFallbackHost();

    const unsubscribe = plugins.onMissingKey((key) => `Missing: ${key}`);

    expect(api.t("unknown" as never)).toBe("Missing: unknown");

    unsubscribe();

    expect(api.t("unknown" as never)).toBe("unknown");
  });

  it("surfaces load errors through the returned callbacks", async () => {
    const i18n = createI18n({ locale: "en", defaultNs: "common" }).use(attachLoader);
    i18n.registerLoader(async (_language, namespace) => {
      if (namespace === "admin") {
        throw new Error("admin namespace failed");
      }
      return {};
    });
    await i18n.init();

    let loader!: UseI18nLoaderReturn;
    const loadErrors: Array<{ language: string; namespace: string; message: string }> = [];
    const Probe = () => {
      loader = useI18nLoader();
      return <div />;
    };

    renderSolid(() => (
      <I18nProvider i18n={i18n} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    const unsubscribe = loader.onLoadError((language, namespace, error) => {
      loadErrors.push({ language, namespace, message: error.message });
    });

    // This file runs only under the `unit` project, which resolves ../src with
    // __DEV__ true, so the dev message is the only reachable one.
    await expect(loader.addActiveNamespace("admin")).rejects.toThrow(
      '[i18n] Failed to load all namespaces for locale "en": admin',
    );
    expect(loadErrors).toEqual([
      {
        language: "en",
        namespace: "admin",
        message: "admin namespace failed",
      },
    ]);

    unsubscribe();
  });

  it("exposes formatting methods that use the current language", () => {
    const fake = new FakeI18n({ language: "en" });

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(api.formatNumber(1234.5)).toBe("1,234.5");
    // Built and formatted in UTC so the rendered day cannot shift with the
    // machine's zone; `formatDate` forwards `Intl.DateTimeFormatOptions`.
    expect(
      api.formatDate(new Date(Date.UTC(2026, 0, 1)), { timeZone: "UTC", dateStyle: "medium" }),
    ).toBe("Jan 1, 2026");
    expect(api.formatCurrency(9.99, "USD")).toBe("$9.99");
    expect(api.formatRelativeTime(-1, "day")).toBe("1 day ago");
  });

  it("re-renders a formatter expression in JSX when the locale switches", async () => {
    const fake = new FakeI18n({ language: "en" });

    const Price = () => {
      const { formatCurrency } = useI18n();
      return <span>{formatCurrency(1234.5, "EUR")}</span>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Price />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("€1,234.50");

    await fake.setLocale("de");
    await flushMicrotasks();

    expect(container.textContent).toBe(
      new Intl.NumberFormat("de", { style: "currency", currency: "EUR" }).format(1234.5),
    );
  });

  it("re-runs a createMemo over formatDate when the locale switches", async () => {
    const fake = new FakeI18n({ language: "en" });
    const day = new Date(Date.UTC(2026, 0, 1));
    const options = { timeZone: "UTC", dateStyle: "long" } as const;
    let runs = 0;

    let label!: () => string;
    const Probe = () => {
      const { formatDate } = useI18n();
      label = createMemo(() => {
        runs += 1;
        return formatDate(day, options);
      });
      return null;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(label()).toBe("January 1, 2026");
    expect(runs).toBe(1);

    await fake.setLocale("de");
    await flushMicrotasks();

    expect(label()).toBe(new Intl.DateTimeFormat("de", options).format(day));
    expect(runs).toBe(2);
  });

  it("lets a trailing locale argument override the render locale", async () => {
    const fake = new FakeI18n({ language: "en" });

    const Probe = () => {
      const { formatNumber, formatDate, formatCurrency, formatRelativeTime } = useI18n();
      const day = new Date(Date.UTC(2026, 0, 1));
      return (
        <div>
          {formatNumber(1234.5, undefined, "de")}|
          {formatDate(day, { timeZone: "UTC", month: "long" }, "fr")}|
          {formatCurrency(1, "EUR", undefined, "de")}|
          {formatRelativeTime(-1, "day", undefined, "fr")}
        </div>
      );
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    const expected = [
      new Intl.NumberFormat("de").format(1234.5),
      new Intl.DateTimeFormat("fr", { timeZone: "UTC", month: "long" }).format(
        new Date(Date.UTC(2026, 0, 1)),
      ),
      new Intl.NumberFormat("de", { style: "currency", currency: "EUR" }).format(1),
      new Intl.RelativeTimeFormat("fr").format(-1, "day"),
    ].join("|");
    expect(container.textContent).toBe(expected);

    await fake.setLocale("ar");
    await flushMicrotasks();

    expect(container.textContent).toBe(expected);
  });

  it("exposes dir() that reflects the current language direction", async () => {
    const fake = new FakeI18n({ language: "en" });

    const Probe = () => {
      const { dir } = useI18n();
      return <div>{dir()}</div>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("ltr");

    await fake.setLocale("ar");
    await flushMicrotasks();

    expect(container.textContent).toBe("rtl");
  });

  it("empties the host catalog through clearTranslations()", () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({ en: { greeting: "Hello" } });

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(api.t("greeting" as never)).toBe("Hello");

    api.clearTranslations();

    expect(api.t("greeting" as never)).toBe("greeting");
  });

  it("exposes the host's loaded catalog through getTranslationCache()", () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    fake.addTranslations({ en: { greeting: "Hello" } });

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(api.getTranslationCache().get("en:common")).toEqual({ greeting: "Hello" });
  });

  it("routes reportError() to the host's configured error handler", () => {
    const reported: Array<{ message: string; source: string | undefined }> = [];
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      onError: (error, context) =>
        reported.push({ message: error.message, source: context?.source }),
    });
    const failure = new Error("plugin blew up");

    let api!: ReturnType<typeof useI18n>;
    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    renderSolid(() => (
      <I18nProvider i18n={i18n} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    api.reportError(failure, { source: "plugin" });

    expect(reported).toEqual([{ message: "plugin blew up", source: "plugin" }]);
  });

  it("supports on() subscriptions with unsubscribe", async () => {
    const fake = new FakeI18n({ language: "en" });
    const seen: string[] = [];
    let api!: ReturnType<typeof useI18n>;

    const Probe = () => {
      api = useI18n();
      return <div />;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    const unsubscribe = api.on("localeChanged", ({ to }) => {
      seen.push(to);
    });

    await fake.setLocale("fr");
    expect(seen).toEqual(["fr"]);

    unsubscribe();
    await fake.setLocale("de");

    expect(seen).toEqual(["fr"]);
  });
});
