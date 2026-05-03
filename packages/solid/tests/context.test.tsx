import { describe, it, expect, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { I18nProvider, useI18nContext } from "../src/context";
import { useI18n } from "../src/useI18n";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";

describe("solid context", () => {
  it("throws when context is requested outside provider", () => {
    const container = document.createElement("div");
    const Bad = () => {
      useI18nContext();
      return null;
    };

    expect(() => render(() => <Bad />, container)).toThrow(
      "[@comvi/solid] i18n context not found.",
    );
  });

  it("useI18nContext returns the same i18n instance from provider", () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });
    let received: unknown;

    const Probe = () => {
      received = useI18nContext();
      return null;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(received).toBe(fake.asI18n());
    dispose();
  });

  it("auto-initializes when enabled and instance is not initialized", async () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });
    const Probe = () => {
      const { isInitialized } = useI18n();
      return <div>{String(isInitialized())}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    await vi.waitFor(() => {
      expect(container.textContent).toBe("true");
    });

    dispose();
  });

  it("does not auto-init when autoInit is false", async () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });
    const Probe = () => {
      const { isInitialized } = useI18n();
      return <div>{String(isInitialized())}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    await Promise.resolve();
    expect(container.textContent).toBe("false");
    dispose();
  });

  it("keeps the subtree mounted when auto-init fails", async () => {
    const container = document.createElement("div");
    const fake = new FakeI18n({ language: "en" });
    fake.initError = new Error("init failed");
    const Probe = () => {
      const { isInitialized } = useI18n();
      return <div>{String(isInitialized())}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={fake.asI18n()}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(container.textContent).toBe("false");
    dispose();
  });

  it("switches to the latest i18n instance when provider prop changes", async () => {
    const container = document.createElement("div");
    const first = new FakeI18n({ language: "en" });
    const second = new FakeI18n({ language: "fr" });
    const [current, setCurrent] = createSignal(first.asI18n());

    const Probe = () => {
      const { locale } = useI18n();
      return <div>{locale()}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={current()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("en");

    setCurrent(second.asI18n());
    await Promise.resolve();

    expect(container.textContent).toBe("fr");
    dispose();
  });

  it("ignores updates from the previous instance after provider prop changes", async () => {
    const container = document.createElement("div");
    const first = new FakeI18n({ language: "en" });
    const second = new FakeI18n({ language: "fr" });
    const [current, setCurrent] = createSignal(first.asI18n());

    const Probe = () => {
      const { locale } = useI18n();
      return <div>{locale()}</div>;
    };

    const dispose = render(
      () => (
        <I18nProvider i18n={current()} autoInit={false}>
          <Probe />
        </I18nProvider>
      ),
      container,
    );

    expect(container.textContent).toBe("en");

    setCurrent(second.asI18n());
    await Promise.resolve();
    expect(container.textContent).toBe("fr");

    await first.setLocaleAsync("de");
    await Promise.resolve();
    expect(container.textContent).toBe("fr");

    dispose();
  });
});
