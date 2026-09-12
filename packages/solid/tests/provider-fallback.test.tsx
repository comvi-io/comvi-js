/**
 * W4/Q2 — `<I18nProvider fallback>` gates the first paint.
 *
 * The prop reads the provider's own `isInitializing` signal — no second source
 * of truth — so an omitted `fallback` leaves the rendered tree exactly as it
 * was before the gate existed.
 */
import { describe, it, expect } from "vitest";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { renderSolid } from "./test-utils";

const Child = () => <div data-testid="child">child</div>;

/** Flips the host into (and out of) the initializing state the provider reads. */
function setInitializing(fake: FakeI18n, isInitializing: boolean) {
  fake.isInitializing = isInitializing;
  fake.emit("loadingStateChanged", { isLoading: isInitializing, isInitializing });
}

describe("solid I18nProvider fallback", () => {
  it("renders the fallback while the host is initializing, then the children", () => {
    const fake = new FakeI18n({ language: "en" });
    fake.isInitializing = true;

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>
    ));

    expect(container.querySelector("[data-testid=child]")).toBeNull();
    expect(container.textContent).toBe("loading");

    setInitializing(fake, false);

    expect(container.querySelector("[data-testid=child]")).not.toBeNull();
    expect(container.textContent).toBe("child");
  });

  it("renders the children throughout when no fallback is given", () => {
    const fake = new FakeI18n({ language: "en" });
    fake.isInitializing = true;

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Child />
      </I18nProvider>
    ));

    expect(container.querySelector("[data-testid=child]")).not.toBeNull();
  });

  it("closes the gate again when a later init starts", () => {
    const fake = new FakeI18n({ language: "en" });

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("child");

    setInitializing(fake, true);

    expect(container.textContent).toBe("loading");
  });

  it("renders the fallback inside the provider, so it may read the locale", () => {
    const fake = new FakeI18n({ language: "en" });
    fake.isInitializing = true;
    const Spinner = () => <div data-testid="spinner">{useI18n().locale()}</div>;

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<Spinner />}>
        <Child />
      </I18nProvider>
    ));

    expect(container.querySelector("[data-testid=spinner]")?.textContent).toBe("en");
  });

  it("gates on the auto-init the provider itself starts, before the first paint", () => {
    const fake = new FakeI18n({ language: "en" });
    fake.init.mockImplementation(async () => {
      setInitializing(fake, true);
      return fake.asI18n() as never;
    });

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>
    ));

    // Solid flushes the provider's `createEffect` before `render()` returns,
    // so the gate is already closed on the first paint — no flash of keys.
    expect(container.textContent).toBe("loading");
  });
});
