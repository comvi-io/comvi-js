/**
 * The loader half of the house ICU failure sentence, as a react app sees it.
 *
 * A catalog fetched over a loader (`cdnLoader`, `fetchLoader`, `loader(map)`)
 * on a host with no `compiler: icuCompiler` does NOT surface `E_ICU_SYNTAX` to
 * the app: the development preflight throws it inside the namespace load, the
 * loader capability emits it as `loadError`, and what rejects `init()` is the
 * "Failed to load all namespaces" error instead. `isInitialized` therefore
 * never flips, so `<I18nProvider fallback>` keeps painting the fallback and
 * the rejection reaches the provider's `onError` (or `console.error`).
 *
 * Core's side of this is pinned in
 * `packages/core/tests/features/loader-icu-preflight.test.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { attachLoader, createI18n, I18nProvider } from "../src/index";

const ICU_CATALOG = { cart: "{count, plural, one {# item} other {# items}}" };

function icuLoaderHost() {
  const i18n = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
  const loadErrors: Error[] = [];
  i18n.onLoadError((_locale, _namespace, error) => loadErrors.push(error));
  i18n.registerLoader(async () => ICU_CATALOG);
  return { i18n, loadErrors };
}

describe("an ICU catalog over the loader, under <I18nProvider>", () => {
  it("keeps the fallback painted and never renders the children", async () => {
    const { i18n } = icuLoaderHost();
    const onError = vi.fn();
    const child = vi.fn(() => <div data-testid="child">child</div>);

    render(
      <I18nProvider i18n={i18n} fallback={<div>loading</div>} onError={onError}>
        {child()}
      </I18nProvider>,
    );

    await waitFor(() => expect(onError).toHaveBeenCalled());

    expect(screen.getByText("loading")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();
    expect(i18n.isInitialized).toBe(false);
  });

  it("hands the provider's onError the namespace-load failure, not E_ICU_SYNTAX", async () => {
    const { i18n, loadErrors } = icuLoaderHost();
    const onError = vi.fn();

    render(
      <I18nProvider i18n={i18n} fallback={<div>loading</div>} onError={onError}>
        <div data-testid="child">child</div>
      </I18nProvider>,
    );

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    const reported = onError.mock.calls[0]![0] as Error;
    expect(reported.message).toContain("Failed to load all namespaces");
    expect(reported).not.toHaveProperty("code");

    expect(loadErrors).toHaveLength(1);
    expect(loadErrors[0]).toMatchObject({ code: "E_ICU_SYNTAX", argumentType: "plural" });
  });

  it("console.errors the same failure when the provider has no onError", async () => {
    const { i18n } = icuLoaderHost();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <I18nProvider i18n={i18n} fallback={<div>loading</div>}>
        <div data-testid="child">child</div>
      </I18nProvider>,
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());

    const call = spy.mock.calls.find(([first]) => first === "[i18n] Initialization failed:");
    expect(call).toBeDefined();
    expect((call![1] as Error).message).toContain("Failed to load all namespaces");
  });

  it("renders the children once compiler: icuCompiler is passed", async () => {
    const { icuCompiler } = await import("@comvi/core/icu");
    const i18n = attachLoader(
      createI18n({ locale: "en", exposeGlobal: false, compiler: icuCompiler }),
    );
    i18n.registerLoader(async () => ICU_CATALOG);

    render(
      <I18nProvider i18n={i18n} fallback={<div>loading</div>}>
        <div data-testid="child">child</div>
      </I18nProvider>,
    );

    expect(await screen.findByTestId("child")).toBeTruthy();
    expect(screen.queryByText("loading")).toBeNull();
  });
});
