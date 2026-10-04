/**
 * `removeActiveNamespace()` has to reach the provider's store.
 *
 * The snapshot string carries `getActiveNamespaces()`, so a consumer that
 * reads the active set must re-render on a deactivation exactly as it does on
 * an activation. Core emits `configChanged` for that; this pins the wiring
 * end to end, through the `useI18nLoader()` bag a component actually calls.
 */
import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { useI18nLoader } from "../src/capabilityHooks";

function loaderHost() {
  const i18n = attachLoader(
    createI18n({ locale: "en", exposeGlobal: false, messages: { "en:nav": { home: "Home" } } }),
  );
  i18n.registerLoader(async () => ({ title: "Admin" }));
  return i18n;
}

function ActiveNamespaces() {
  const { getActiveNamespaces } = useI18n();
  return <span data-testid="out">{getActiveNamespaces().join(",")}</span>;
}

describe("removeActiveNamespace() under a mounted provider", () => {
  it("re-renders a consumer reading getActiveNamespaces()", async () => {
    const i18n = loaderHost();
    const { getByTestId } = render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <ActiveNamespaces />
      </I18nProvider>,
    );
    await act(async () => {
      await i18n.addActiveNamespace("admin");
    });
    expect(getByTestId("out").textContent).toBe("nav,admin");

    // The provider defers its store notification out of core's synchronous
    // emit stack, so the re-render lands on a microtask.
    await act(async () => {
      i18n.removeActiveNamespace("admin");
    });

    expect(getByTestId("out").textContent).toBe("nav");
  });

  it("deactivates through the useI18nLoader() bag", async () => {
    const i18n = loaderHost();
    function Remover() {
      const { removeActiveNamespace } = useI18nLoader();
      return (
        <button data-testid="drop" onClick={() => removeActiveNamespace("admin")}>
          drop
        </button>
      );
    }
    const { getByTestId } = render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <ActiveNamespaces />
        <Remover />
      </I18nProvider>,
    );
    await act(async () => {
      await i18n.addActiveNamespace("admin");
    });

    await act(async () => {
      getByTestId("drop").click();
    });

    expect(getByTestId("out").textContent).toBe("nav");
  });
});
