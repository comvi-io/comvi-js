/**
 * The server pipeline initializes the host lazily and exactly once — but a
 * FAILED attempt must not poison the instance: the next request has to be able
 * to try again.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createNextI18n } from "../src/createNextI18n";
import { loadTranslations, setI18n } from "../src/server";
import { _resetServerI18n } from "../src/server/cache";

const makeHost = () =>
  createNextI18n({
    locales: ["en", "fr"],
    defaultLocale: "en",
    defaultNs: "common",
    devMode: false,
  }).i18n;

describe("server-side initialization", () => {
  afterEach(() => {
    _resetServerI18n();
  });

  it("does not initialize a host that is already initialized", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeHost();
    await i18n.init();
    const initSpy = vi.spyOn(i18n, "init");
    setI18n(i18n);

    await loadTranslations("fr");

    expect(initSpy).not.toHaveBeenCalled();
  });

  it("initializes a host that has not been initialized yet", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeHost();
    const initSpy = vi.spyOn(i18n, "init");
    setI18n(i18n);

    await loadTranslations("fr");

    expect(initSpy).toHaveBeenCalledOnce();
    expect(i18n.isInitialized).toBe(true);
  });

  it("retries initialization on the next request after a failed attempt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = makeHost();
    const initSpy = vi
      .spyOn(i18n, "init")
      .mockRejectedValueOnce(new Error("plugin blew up during init"));
    setI18n(i18n);

    await expect(loadTranslations("fr")).rejects.toThrow("plugin blew up during init");
    await loadTranslations("fr");

    expect(initSpy).toHaveBeenCalledTimes(2);
    expect(i18n.isInitialized).toBe(true);
  });
});
