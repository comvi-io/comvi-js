/**
 * W4/Q2 — `<I18nProvider fallback>` gates the first paint.
 *
 * The axis is `isInitialized`, not `isInitializing`: auto-init starts from an
 * effect, so "is it initializing" is still false while the tree is being
 * built, and under `autoInit: false` it never becomes true at all — both are
 * paints of raw keys that a gate on that axis lets through.
 */
import { describe, it, expect, vi } from "vitest";
import { I18nProvider } from "../src/context";
import { useI18n } from "../src/useI18n";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { flushMicrotasks, renderSolid } from "./test-utils";

const Child = () => <div data-testid="child">child</div>;

/** A child that records every render, so "never rendered" is observable. */
function spyChild() {
  const renders = vi.fn();
  const Spy = () => {
    renders();
    return <div data-testid="child">child</div>;
  };
  return { renders, Spy };
}

describe("solid I18nProvider fallback", () => {
  it("never renders the children before init resolves, not even the first paint", async () => {
    const fake = new FakeI18n({ language: "en" });
    const { renders, Spy } = spyChild();

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} fallback={<div>loading</div>}>
        <Spy />
      </I18nProvider>
    ));

    // The provider's auto-init effect has run and its promise is in flight.
    expect(renders).not.toHaveBeenCalled();
    expect(container.textContent).toBe("loading");

    await flushMicrotasks(2);

    expect(fake.isInitialized).toBe(true);
    expect(container.textContent).toBe("child");
    expect(renders).toHaveBeenCalledTimes(1);
  });

  it("holds the gate under autoInit: false until the app initializes itself", async () => {
    const fake = new FakeI18n({ language: "en" });
    const { renders, Spy } = spyChild();

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Spy />
      </I18nProvider>
    ));

    expect(fake.init).not.toHaveBeenCalled();
    expect(renders).not.toHaveBeenCalled();
    expect(container.textContent).toBe("loading");

    await fake.asI18n().init();

    expect(container.textContent).toBe("child");
  });

  it("renders the children immediately when the host is already initialized", () => {
    const fake = new FakeI18n({ language: "en" });
    fake.isInitialized = true;

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("child");
  });

  it("renders the children throughout when no fallback is given", () => {
    const fake = new FakeI18n({ language: "en" });

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Child />
      </I18nProvider>
    ));

    expect(container.querySelector("[data-testid=child]")).not.toBeNull();
  });

  it("renders the fallback inside the provider, so it may read the locale", () => {
    const fake = new FakeI18n({ language: "en" });
    const Spinner = () => <div data-testid="spinner">{useI18n().locale()}</div>;

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<Spinner />}>
        <Child />
      </I18nProvider>
    ));

    expect(container.querySelector("[data-testid=spinner]")?.textContent).toBe("en");
  });

  it("closes the gate again when the host is destroyed and re-initialized", async () => {
    const fake = new FakeI18n({ language: "en" });
    fake.isInitialized = true;

    const container = renderSolid(() => (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>
    ));

    expect(container.textContent).toBe("child");

    fake.isInitialized = false;
    fake.emit("destroyed", undefined as never);

    expect(container.textContent).toBe("loading");
  });
});
