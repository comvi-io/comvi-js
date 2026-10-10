import { describe, it, expect, vi } from "vitest";
import { createI18n } from "../../src";

describe("configRevision", () => {
  it("advances by one when a configChanged event is emitted", () => {
    const i18n = createI18n({ locale: "en" });

    i18n.setFallbackLocale("de");

    expect(i18n.configRevision).toBe(1);
  });

  it("stays put for events that are not configChanged", () => {
    const i18n = createI18n({ locale: "en" });

    i18n.locale = "de";

    expect(i18n.configRevision).toBe(0);
  });
});

describe("setFallbackLocale()", () => {
  it("emits configChanged naming the fallbackLocale source", () => {
    const i18n = createI18n({ locale: "en" });
    const received: unknown[] = [];
    i18n.on("configChanged", (data) => received.push(data));

    i18n.setFallbackLocale("de");

    expect(received).toEqual([{ source: "fallbackLocale" }]);
  });
});

describe("on() unsubscribe", () => {
  it("keeps the remaining listener subscribed when one of two unsubscribes", () => {
    const i18n = createI18n({ locale: "en" });
    const stillSubscribed = vi.fn();
    const unsubscribe = i18n.on("localeChanged", vi.fn());
    i18n.on("localeChanged", stillSubscribed);

    unsubscribe();
    i18n.locale = "de";

    expect(stillSubscribed).toHaveBeenCalledWith({ from: "en", to: "de" });
  });

  it("leaves the event usable for a new listener after the same unsubscribe runs twice", () => {
    const i18n = createI18n({ locale: "en" });
    const unsubscribe = i18n.on("localeChanged", vi.fn());
    unsubscribe();
    unsubscribe();

    const resubscribed = vi.fn();
    i18n.on("localeChanged", resubscribed);
    i18n.locale = "de";

    expect(resubscribed).toHaveBeenCalledWith({ from: "en", to: "de" });
  });
});

describe("missing-key notifications", () => {
  it("emits missingKey with the key, locale and namespace", () => {
    const i18n = createI18n({ locale: "en" });
    const received: unknown[] = [];
    i18n.on("missingKey", (data) => received.push(data));

    i18n.t("absent");

    expect(received).toEqual([{ key: "absent", locale: "en", namespace: "default" }]);
  });

  it("calls the onMissingKey option with the key, locale and namespace", () => {
    const onMissingKey = vi.fn();
    const i18n = createI18n({ locale: "en", onMissingKey });

    i18n.t("absent");

    expect(onMissingKey).toHaveBeenCalledWith({
      key: "absent",
      locale: "en",
      namespace: "default",
    });
  });
});
