import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

describe("reportError() without an onError handler (dev)", () => {
  it("warns with the unknown source when no context is supplied", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    i18n.reportError(new Error("boom"));

    expect(warnSpy).toHaveBeenCalledWith("[i18n] unknown: boom");
  });

  it("appends every populated context field, comma-separated, after the source", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en" });

    i18n.reportError(new Error("boom"), {
      source: "translation",
      tagName: "b",
      key: "greeting",
      locale: "en",
      namespace: "nav",
    });

    expect(warnSpy).toHaveBeenCalledWith("[i18n] translation (b, greeting, en, nav): boom");
  });
});

describe("init() failure reporting", () => {
  it("reports the failure with the init source", async () => {
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", onError });
    await i18n.destroy();

    await expect(i18n.init()).rejects.toThrow(/Cannot call init\(\) after destroy\(\)/);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "[i18n] Cannot call init() after destroy(). Create a new i18n instance.",
      }),
      { source: "init" },
    );
  });
});

describe("post-processors", () => {
  it("applies the registered processor and reports nothing", () => {
    const onError = vi.fn();
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" } },
      postProcess: (result) => `${result}!`,
      onError,
    });

    expect(i18n.t("greeting")).toBe("Hello!");
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a throwing processor with the key and namespace, and leaves the value unprocessed", () => {
    const failure = new Error("post-process failed");
    const onError = vi.fn();
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello" } },
      postProcess: () => {
        throw failure;
      },
      onError,
    });

    expect(i18n.t("greeting")).toBe("Hello");
    expect(onError).toHaveBeenCalledWith(failure, {
      source: "post-processor",
      key: "greeting",
      namespace: "default",
    });
  });
});
