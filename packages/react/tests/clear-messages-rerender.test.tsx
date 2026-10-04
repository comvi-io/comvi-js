/**
 * A scopeless `clearMessages()` keeps the active namespace set, so the
 * provider's snapshot string no longer changes through `getActiveNamespaces()`.
 * `translationCache.getRevision()` is what has to carry the re-render — this
 * proves the refetch fix was not traded for a staleness bug.
 */
import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { createI18n } from "../src/index";

describe("clearMessages() under a mounted provider", () => {
  it("re-renders a consumer whose translation is gone", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greet: "Hello" } },
    });

    function Consumer() {
      const { t } = useI18n();
      return <span data-testid="out">{t("greet" as never)}</span>;
    }

    const { getByTestId } = render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <Consumer />
      </I18nProvider>,
    );
    expect(getByTestId("out").textContent).toBe("Hello");

    // The provider defers its store notification out of core's synchronous
    // emit stack, so the re-render lands on a microtask.
    await act(async () => {
      i18n.clearMessages();
    });

    expect(getByTestId("out").textContent).toBe("greet");
  });

  it("keeps the namespace active across the clear", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { "en:nav": { home: "Home" } },
    });

    i18n.clearMessages();

    expect(i18n.getActiveNamespaces()).toEqual(["nav"]);
  });
});
