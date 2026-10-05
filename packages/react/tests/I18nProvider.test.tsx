import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { I18nProvider, useI18nHost, useIsLoading, useLocale } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { flushEffects } from "./test-utils";

const LocaleProbe = () => <div data-testid="lang">{useLocale()}</div>;

const LoadingProbe = () => {
  const { isLoading, isInitializing } = useIsLoading();
  return <div data-testid="loading">{`${isLoading}|${isInitializing}`}</div>;
};

describe("I18nProvider", () => {
  it("provides context to child components", () => {
    const fake = new FakeI18n();

    const Wrapped = () => {
      const locale = useLocale();
      return <div data-testid="lang">{locale}</div>;
    };

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Wrapped />
      </I18nProvider>,
    );

    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("auto-initializes when autoInit is true and instance is not initialized", async () => {
    const fake = new FakeI18n();

    render(
      <I18nProvider i18n={fake.asI18n()}>
        <div />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(fake.init).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call init() when autoInit is false", async () => {
    const fake = new FakeI18n();

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <div />
      </I18nProvider>,
    );

    await flushEffects();

    expect(fake.init).not.toHaveBeenCalled();
  });

  it("does not call init() when i18n is already initialized", async () => {
    const fake = new FakeI18n();
    fake.isInitialized = true;

    render(
      <I18nProvider i18n={fake.asI18n()}>
        <div />
      </I18nProvider>,
    );

    await flushEffects();

    expect(fake.init).not.toHaveBeenCalled();
  });

  it("normalizes non-Error init rejection and calls onError exactly once", async () => {
    const fake = new FakeI18n();
    fake.initError = "plugin failed";
    const onError = vi.fn();

    render(
      <I18nProvider i18n={fake.asI18n()} onError={onError}>
        <div />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });

    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("plugin failed");
  });

  it("passes an Error init rejection through to onError unchanged", async () => {
    const fake = new FakeI18n();
    const initError = new Error("loader offline");
    fake.initError = initError;
    const onError = vi.fn();

    render(
      <I18nProvider i18n={fake.asI18n()} onError={onError}>
        <div />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(initError);
    });
  });

  it("logs the initialization failure when no onError handler is given", async () => {
    const fake = new FakeI18n();
    fake.initError = "plugin failed";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <I18nProvider i18n={fake.asI18n()}>
        <div />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        "[@comvi/react] Initialization failed:",
        expect.objectContaining({ message: "plugin failed" }),
      );
    });
  });

  it("initializes once autoInit flips from false to true", async () => {
    const fake = new FakeI18n();
    const Host = ({ autoInit }: { autoInit: boolean }) => (
      <I18nProvider i18n={fake.asI18n()} autoInit={autoInit}>
        <div />
      </I18nProvider>
    );

    const { rerender } = render(<Host autoInit={false} />);
    await flushEffects();
    rerender(<Host autoInit={true} />);

    await waitFor(() => {
      expect(fake.init).toHaveBeenCalledTimes(1);
    });
  });

  // `useLocale` reads ONLY the provider's locale store, so each of the three
  // events feeding that store needs its own row.
  it.each(["localeChanged", "initialized", "configChanged"] as const)(
    "updates useLocale() when %s is emitted",
    async (event) => {
      const fake = new FakeI18n();

      render(
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <LocaleProbe />
        </I18nProvider>,
      );

      act(() => {
        fake.language = "fr";
        fake.emit(event, undefined as never);
      });

      await waitFor(() => {
        expect(screen.getByTestId("lang").textContent).toBe("fr");
      });
    },
  );

  it.each(["loadingStateChanged", "initialized"] as const)(
    "updates useIsLoading() when %s is emitted",
    async (event) => {
      const fake = new FakeI18n();

      render(
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <LoadingProbe />
        </I18nProvider>,
      );

      act(() => {
        fake.isLoading = true;
        fake.isInitializing = true;
        fake.emit(event, undefined as never);
      });

      await waitFor(() => {
        expect(screen.getByTestId("loading").textContent).toBe("true|true");
      });
    },
  );

  it("throws when useLocale is used outside I18nProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<LocaleProbe />)).toThrow(
      "[@comvi/react] useLocale must be used within an I18nProvider",
    );
  });

  it("releases its host event listeners on unmount", () => {
    const fake = new FakeI18n();

    const { unmount } = render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <LocaleProbe />
      </I18nProvider>,
    );
    const whileMounted = fake.listenerCount("localeChanged");
    unmount();

    expect(whileMounted).toBeGreaterThan(0);
    expect(fake.listenerCount("localeChanged")).toBe(0);
  });

  it("re-renders consumers when localeChanged is emitted", async () => {
    const fake = new FakeI18n();

    const Wrapped = () => {
      const locale = useLocale();
      return <div data-testid="lang">{locale}</div>;
    };

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Wrapped />
      </I18nProvider>,
    );

    expect(screen.getByTestId("lang").textContent).toBe("en");

    act(() => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("lang").textContent).toBe("fr");
    });
  });

  it("uses SSR snapshot props for server rendering", () => {
    const fake = new FakeI18n();
    fake.language = "en";
    fake.isLoading = false;
    fake.isInitializing = false;

    const Probe = () => {
      const locale = useLocale();
      const { isLoading, isInitializing } = useIsLoading();
      return (
        <div>
          {locale}|{String(isLoading)}|{String(isInitializing)}
        </div>
      );
    };

    const html = renderToString(
      <I18nProvider
        i18n={fake.asI18n()}
        autoInit={false}
        ssrLocale="uk"
        ssrInitialIsLoading={true}
        ssrInitialIsInitializing={true}
      >
        <Probe />
      </I18nProvider>,
    );

    expect(html.replaceAll("<!-- -->", "")).toContain("uk|true|true");
  });

  it("stops propagating store updates to consumers after unmount", async () => {
    const fake = new FakeI18n();
    const renderSpy = vi.fn();

    const Wrapped = () => {
      const locale = useLocale();
      renderSpy(locale);
      return <div data-testid="lang">{locale}</div>;
    };

    const { unmount } = render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Wrapped />
      </I18nProvider>,
    );

    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(renderSpy).toHaveBeenCalledTimes(1);

    act(() => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("lang").textContent).toBe("fr");
    });
    expect(renderSpy).toHaveBeenCalledTimes(2);

    unmount();

    act(() => {
      fake.language = "de";
      fake.isLoading = true;
      fake.emit("localeChanged", { from: "fr", to: "de" });
      fake.emit("loadingStateChanged", { isLoading: true, isInitializing: false });
      fake.emit("initialized", undefined);
    });

    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it("re-renders consumers when configChanged is emitted (cache revision changes)", async () => {
    const fake = new FakeI18n();
    const renderSpy = vi.fn();

    const Wrapped = () => {
      const { messagesCache } = useI18n();
      renderSpy(messagesCache.size);
      return <div data-testid="cache-size">{messagesCache.size}</div>;
    };

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Wrapped />
      </I18nProvider>,
    );

    expect(screen.getByTestId("cache-size").textContent).toBe("0");
    expect(renderSpy).toHaveBeenCalledTimes(1);

    act(() => {
      // Bump the cache revision the way a plugin mutating translations would,
      // then fire the only event the cache subscription sees here.
      fake.messagesCache.set("en", "default", { greeting: "Hello" });
      fake.emit("configChanged", { source: "fallbackLocale" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("cache-size").textContent).toBe("1");
    });
    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it("switches to the new i18n instance when the i18n prop changes", async () => {
    const first = new FakeI18n();
    const second = new FakeI18n();
    second.language = "fr";

    const Wrapped = () => {
      const locale = useLocale();
      return <div data-testid="lang">{locale}</div>;
    };
    const Host = ({ fake }: { fake: FakeI18n }) => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Wrapped />
      </I18nProvider>
    );

    const { rerender } = render(<Host fake={first} />);

    expect(screen.getByTestId("lang").textContent).toBe("en");

    rerender(<Host fake={second} />);
    await flushEffects();

    expect(screen.getByTestId("lang").textContent).toBe("fr");

    act(() => {
      first.language = "de";
      first.emit("localeChanged", { from: "en", to: "de" });
    });

    expect(screen.getByTestId("lang").textContent).toBe("fr");
  });
});

describe("useI18nHost", () => {
  it("returns the provider's host", () => {
    const fake = new FakeI18n({ language: "en" });
    let host: unknown;

    function Probe() {
      host = useI18nHost();
      return null;
    }

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>,
    );

    expect(host).toBe(fake.asI18n());
  });

  it("throws outside a provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Probe() {
      useI18nHost();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(
      "[@comvi/react] Hooks must be used within an I18nProvider.",
    );
  });
});
