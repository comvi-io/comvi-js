/**
 * W4/Q2 — `<I18nProvider fallback>` gates the first paint.
 *
 * The quickstarts all prescribed their own loading gate and every one of them
 * flashed raw keys before the host finished initializing. The prop reads the
 * provider's own `isInitializing` — no second source of truth — so an omitted
 * `fallback` leaves the rendered tree exactly as it was.
 */
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { I18nProvider, useLocale } from "../src/I18nProvider";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

const Child = () => <div data-testid="child">child</div>;

/** Flips the host into (and out of) the initializing state the provider reads. */
function setInitializing(fake: FakeI18n, isInitializing: boolean) {
  act(() => {
    fake.isInitializing = isInitializing;
    fake.emit("loadingStateChanged", { isLoading: isInitializing, isInitializing });
  });
}

describe("I18nProvider fallback", () => {
  it("renders the fallback while the host is initializing, then the children", async () => {
    const fake = new FakeI18n();
    fake.isInitializing = true;

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>,
    );

    expect(screen.queryByTestId("child")).toBeNull();
    expect(screen.getByText("loading")).toBeTruthy();

    setInitializing(fake, false);

    expect(await screen.findByTestId("child")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
  });

  it("renders the children throughout when no fallback is given", () => {
    const fake = new FakeI18n();
    fake.isInitializing = true;

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Child />
      </I18nProvider>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("closes the gate again when a later init starts", async () => {
    const fake = new FakeI18n();

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();

    setInitializing(fake, true);

    expect(await screen.findByText("loading")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();
  });

  it("renders the fallback inside the providers, so it may read the locale", () => {
    const fake = new FakeI18n();
    fake.isInitializing = true;
    const Spinner = () => <div data-testid="spinner">{useLocale()}</div>;

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<Spinner />}>
        <Child />
      </I18nProvider>,
    );

    expect(screen.getByTestId("spinner").textContent).toBe("en");
  });
});
