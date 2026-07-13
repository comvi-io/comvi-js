import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { createI18n } from "@comvi/core";

describe("useStoreRevision — commit→subscribe (t2) window", () => {
  it("re-renders when defaultParams change during the commit→subscribe window", async () => {
    const i18n = createI18n<{ formality: "formal" | "informal" }>({
      locale: "en",
      defaultParams: { formality: "formal" },
      translation: {
        en: { review: "{formality, select, formal {Formal} other {Informal}}" },
      },
    });

    let rendered = "";
    function Consumer() {
      const { t, defaultParams } = useI18n<{ formality: "formal" | "informal" }>();
      rendered = `${defaultParams.formality}:${t("review" as never)}`;
      return <span>{rendered}</span>;
    }

    function Injector() {
      useLayoutEffect(() => {
        i18n.setDefaultParams({ formality: "informal" });
      }, []);
      return null;
    }

    render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <Injector />
        <Consumer />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(rendered).toBe("informal:Informal");
    });
  });

  it("re-renders for a non-cache event fired during the commit→subscribe window", async () => {
    const i18n = createI18n({
      locale: "fr",
      defaultNs: "common",
      translation: {
        en: { fallbackOnly: "Fallback" },
      },
    });

    let rendered = "";
    function Consumer() {
      const { t } = useI18n();
      rendered = t("fallbackOnly" as never) as string;
      return <span data-testid="out">{rendered}</span>;
    }

    // Layout effect runs during commit, before the consumer's passive subscribe (t2).
    function Injector() {
      useLayoutEffect(() => {
        i18n.setFallbackLocale("en");
      }, []);
      return null;
    }

    const revisionBefore = i18n.translationCache.getRevision();

    render(
      <I18nProvider i18n={i18n} autoInit={false}>
        <Injector />
        <Consumer />
      </I18nProvider>,
    );

    expect(i18n.translationCache.getRevision()).toBe(revisionBefore);

    await waitFor(() => {
      expect(rendered).toBe("Fallback");
    });
  });
});
