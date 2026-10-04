/**
 * `useI18n().t` injects the React-tracked locale into every call. A no-params
 * call must reuse ONE options object per render locale rather than allocating
 * a fresh `{ locale }` per call — solid keeps core's no-params fast path for
 * the same reason (`packages/solid/src/useI18n.ts`).
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nProvider } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import { createI18n } from "../src/index";
import type { ErrorReportContext } from "@comvi/core";
import { setLocale } from "./test-utils";

const createWrapper = (fake: FakeI18n) => {
  return ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={fake.asI18n()} autoInit={false}>
      {children}
    </I18nProvider>
  );
};

/** The options object the host was handed on call number `nth` (0-based). */
const optionsOf = (fake: FakeI18n, nth: number) => fake.tRaw.mock.calls[nth]?.[1];

describe("useI18n t() options object", () => {
  it("two no-params calls → the host receives the same options object", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    result.current.t("greeting" as never);
    result.current.t("farewell" as never);

    expect(optionsOf(fake, 0)).toBe(optionsOf(fake, 1));
  });

  it("a no-params call → the options carry the render locale and nothing else", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    result.current.t("greeting" as never);

    expect(optionsOf(fake, 0)).toEqual({ locale: "en" });
  });

  it("a call with params → the params are merged over the render locale", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    result.current.t("greeting" as never, { name: "Ada" } as never);

    expect(optionsOf(fake, 0)).toEqual({ locale: "en", name: "Ada" });
  });

  it("a call with an explicit params.locale → that locale wins over the render locale", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    result.current.t("greeting" as never, { locale: "fr" } as never);

    expect(optionsOf(fake, 0)).toEqual({ locale: "fr" });
  });

  it("a call with params → a fresh object, never the shared one", () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });

    result.current.t("greeting" as never);
    result.current.t("greeting" as never, { name: "Ada" } as never);

    expect(optionsOf(fake, 1)).not.toBe(optionsOf(fake, 0));
  });

  it("a namespaced hook → the host receives a fresh options object per call", () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    const { result } = renderHook(() => useI18n("forms"), { wrapper: createWrapper(fake) });

    result.current.t("greeting" as never);
    result.current.t("farewell" as never);

    expect(optionsOf(fake, 1)).not.toBe(optionsOf(fake, 0));
  });

  it("a namespaced hook → the options carry the bound namespace beside the locale", () => {
    const fake = new FakeI18n({ language: "en", defaultNamespace: "common" });
    const { result } = renderHook(() => useI18n("forms"), { wrapper: createWrapper(fake) });

    result.current.t("greeting" as never);

    expect(optionsOf(fake, 0)).toEqual({ ns: "forms", locale: "en" });
  });

  it("a postProcess writing to its params argument → reported, and the render survives", () => {
    const sources: Array<string | undefined> = [];
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      messages: { en: { greeting: "Hello" } },
      postProcess: (translationResult, _key, _ns, params) => {
        (params as Record<string, unknown>).touched = true;
        return translationResult;
      },
      onError: (_error: Error, context?: ErrorReportContext) => sources.push(context?.source),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nProvider i18n={i18n} autoInit={false}>
        {children}
      </I18nProvider>
    );
    const { result } = renderHook(() => useI18n(), { wrapper });

    const rendered = result.current.t("greeting" as never);

    expect(rendered).toBe("Hello");
    expect(sources).toEqual(["post-processor"]);
  });

  it("the locale changes → the reused options carry the new locale", async () => {
    const fake = new FakeI18n({ language: "en" });
    const { result } = renderHook(() => useI18n(), { wrapper: createWrapper(fake) });
    result.current.t("greeting" as never);

    await setLocale(fake.asI18n(), "fr");
    result.current.t("greeting" as never);

    expect(optionsOf(fake, 1)).toEqual({ locale: "fr" });
  });
});
