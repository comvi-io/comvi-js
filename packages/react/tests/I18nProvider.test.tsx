import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { I18nProvider, useI18nContext } from "../src/I18nProvider";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

describe("I18nProvider", () => {
  it("provides context to child components", () => {
    const fake = new FakeI18n();

    const Wrapped = () => {
      const { locale } = useI18nContext();
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

    await act(async () => {});
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

    await act(async () => {});
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

  it("re-renders consumers when localeChanged is emitted", async () => {
    const fake = new FakeI18n();

    const Wrapped = () => {
      const { locale } = useI18nContext();
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
      const { locale, isLoading, isInitializing } = useI18nContext();
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
        ssrInitialLocale="uk"
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
      const { locale } = useI18nContext();
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
});
