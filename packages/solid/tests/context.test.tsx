import { describe, it, expect, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { I18nProvider, useI18nContext } from "../src/context";
import { useI18n } from "../src/useI18n";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { flushMicrotasks, renderSolid } from "./test-utils";

describe("solid context", () => {
  it("throws when context is requested outside provider", () => {
    const container = document.createElement("div");
    const Bad = () => {
      useI18nContext();
      return null;
    };

    expect(() => render(() => <Bad />, container)).toThrow(
      "[@comvi/solid] i18n context not found. Wrap your app with <I18nProvider i18n={i18n}>.",
    );
  });

  it("useI18nContext returns the same i18n instance from provider", () => {
    const fake = new FakeI18n({ language: "en" });
    let received: unknown;

    const Probe = () => {
      received = useI18nContext();
      return null;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(received).toBe(fake.asI18n());
  });

  it("auto-initializes when enabled and instance is not initialized", async () => {
    const fake = new FakeI18n({ language: "en" });
    const Probe = () => {
      const { isInitialized } = useI18n();
      return <div>{String(isInitialized())}</div>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()}>
        <Probe />
      </I18nProvider>
    ));

    await vi.waitFor(() => {
      expect(container.textContent).toBe("true");
    });
  });

  it("does not auto-init when autoInit is false", async () => {
    const fake = new FakeI18n({ language: "en" });
    const Probe = () => {
      const { isInitialized } = useI18n();
      return <div>{String(isInitialized())}</div>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    await flushMicrotasks(3);

    // `init` never being CALLED cannot pass late, which is what makes the
    // rendered flag below a real negative rather than a not-yet.
    expect(fake.init).not.toHaveBeenCalled();
    expect(container.textContent).toBe("false");
  });

  it("keeps the subtree mounted when auto-init fails", async () => {
    const fake = new FakeI18n({ language: "en" });
    fake.initError = new Error("init failed");
    const Probe = () => {
      const { isInitialized } = useI18n();
      return <div data-testid="probe">{String(isInitialized())}</div>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()}>
        <Probe />
      </I18nProvider>
    ));

    await flushMicrotasks(2);

    expect(container.querySelector('[data-testid="probe"]')).not.toBeNull();
    expect(container.textContent).toBe("false");
  });

  it("invokes onError when auto-init fails", async () => {
    const fake = new FakeI18n({ language: "en" });
    fake.initError = new Error("init failed");
    const errors: Error[] = [];
    const Probe = () => {
      useI18n();
      return null;
    };

    renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} onError={(e) => errors.push(e)}>
        <Probe />
      </I18nProvider>
    ));

    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors[0].message).toBe("init failed");
  });

  it("switches to the latest i18n instance when provider prop changes", async () => {
    const first = new FakeI18n({ language: "en" });
    const second = new FakeI18n({ language: "fr" });
    const [current, setCurrent] = createSignal(first.asI18n());

    const Probe = () => {
      const { locale } = useI18n();
      return <div>{locale()}</div>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={current()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("en");

    setCurrent(second.asI18n());
    await flushMicrotasks();

    expect(container.textContent).toBe("fr");
  });

  it("ignores updates from the previous instance after provider prop changes", async () => {
    const first = new FakeI18n({ language: "en" });
    const second = new FakeI18n({ language: "fr" });
    const [current, setCurrent] = createSignal(first.asI18n());

    const Probe = () => {
      const { locale } = useI18n();
      return <div>{locale()}</div>;
    };

    const container = renderSolid(() => (
      <I18nProvider i18n={current()} autoInit={false}>
        <Probe />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("en");

    setCurrent(second.asI18n());
    await flushMicrotasks();
    expect(container.textContent).toBe("fr");

    await first.setLocaleAsync("de");
    await flushMicrotasks(2);

    expect(container.textContent).toBe("fr");
  });
});
