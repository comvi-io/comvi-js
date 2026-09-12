/**
 * W4/Q2 — `<I18nProvider fallback>` gates the first paint.
 *
 * The quickstarts all prescribed their own loading gate and every one of them
 * flashed raw keys before the host finished initializing. The axis is
 * `isInitialized`, not `isInitializing`: `init()` starts from an effect, so on
 * the very first render "is it initializing" is still false and a gate on it
 * would let the raw-key frame through — which is the frame F23 is about.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import React from "react";
import { I18nProvider, useLocale } from "../src/I18nProvider";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

const Child = () => <div data-testid="child">child</div>;

/** A child that records every render, so "never committed" is observable. */
function spyChild() {
  const renders = vi.fn();
  const Spy = () => {
    renders();
    return <div data-testid="child">child</div>;
  };
  return { renders, Spy };
}

describe("I18nProvider fallback", () => {
  it("never renders the children before init resolves, not even the first frame", async () => {
    const fake = new FakeI18n();
    const { renders, Spy } = spyChild();

    render(
      <I18nProvider i18n={fake.asI18n()} fallback={<div>loading</div>}>
        <Spy />
      </I18nProvider>,
    );

    // The provider's own auto-init is in flight. With a gate on
    // `isInitializing` the children would already have rendered once here.
    expect(renders).not.toHaveBeenCalled();
    expect(screen.getByText("loading")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();

    expect(await screen.findByTestId("child")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
    expect(fake.isInitialized).toBe(true);
  });

  it("holds the gate under autoInit: false until the app initializes itself", async () => {
    const fake = new FakeI18n();
    const { renders, Spy } = spyChild();

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Spy />
      </I18nProvider>,
    );

    expect(fake.init).not.toHaveBeenCalled();
    expect(renders).not.toHaveBeenCalled();
    expect(screen.getByText("loading")).toBeTruthy();

    await act(async () => {
      await fake.asI18n().init();
    });

    expect(await screen.findByTestId("child")).toBeTruthy();
  });

  it("renders the children immediately when the host is already initialized", () => {
    const fake = new FakeI18n();
    fake.isInitialized = true;
    const { renders } = spyChild();

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
    expect(renders).not.toHaveBeenCalled();
  });

  it("renders the children throughout when no fallback is given", () => {
    const fake = new FakeI18n();

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false}>
        <Child />
      </I18nProvider>,
    );

    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("treats fallback={undefined} as no fallback at all", () => {
    const fake = new FakeI18n();

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={undefined}>
        <Child />
      </I18nProvider>,
    );

    // The gate is `fallback !== undefined`, not `"fallback" in props`: a prop
    // forwarded as `undefined` (every wrapper that spreads its own optional
    // prop does this) must leave the tree exactly as omitting it does.
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  it("renders the fallback inside the providers, so it may read the locale", () => {
    const fake = new FakeI18n();
    const Spinner = () => <div data-testid="spinner">{useLocale()}</div>;

    render(
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<Spinner />}>
        <Child />
      </I18nProvider>,
    );

    expect(screen.getByTestId("spinner").textContent).toBe("en");
  });

  it("hydrates a server render of the children without a mismatch, then gates", async () => {
    const fake = new FakeI18n();
    const tree = (
      <I18nProvider i18n={fake.asI18n()} autoInit={false} fallback={<div>loading</div>}>
        <Child />
      </I18nProvider>
    );

    // Default `ssrInitialIsInitializing: false` means "ready" on the server
    // snapshot, so the server paints the children.
    const html = renderToString(tree);
    expect(html).toContain("child");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree);
    });

    // The hydration render reads the SAME server snapshot, so React has
    // nothing to complain about; the gate re-applies straight after.
    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe("loading");

    act(() => {
      root!.unmount();
    });
  });
});
