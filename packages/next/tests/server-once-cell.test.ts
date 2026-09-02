/**
 * Configuring the server i18n from two sources is a programming error, and the
 * error has to name BOTH the source that already configured the cell and the
 * one that arrived second — that is the whole diagnostic.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { createNextI18nFromHost } from "../src/server";
import { _resetServerI18n, setI18n } from "../src/server/cache";

const ROUTING = { locales: ["en", "fr"], defaultLocale: "en" };

const composedHost = () =>
  attachLoader(
    createI18n({ locale: "en", defaultNs: "common", exposeGlobal: false, devMode: false }),
  );

/**
 * `expect(fn).toThrow(message)` still passes when the thrown value is
 * `undefined`, which would let a conflict "reported" with no diagnostic slip
 * through. Capturing the value and asserting it IS an Error closes that.
 */
const captureThrown = (run: () => unknown): Error => {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`Expected an Error to be thrown, but got: ${String(error)}`);
  }
  throw new Error("Expected the call to throw, but it returned normally");
};

const REPEAT_ADVICE = "Configure it once — only a same-instance setI18n() repeats.";

beforeEach(() => {
  _resetServerI18n();
});

describe("server i18n once-cell", () => {
  it("accepts a repeated setI18n with the same instance", () => {
    const host = composedHost();

    setI18n(host);

    expect(() => setI18n(host)).not.toThrow();
  });

  it("rejects a second setI18n with a different instance, naming setI18n twice", () => {
    setI18n(composedHost());

    const conflict = captureThrown(() => setI18n(composedHost()));

    expect(conflict.message).toBe(
      `[comvi/next] i18n already configured by setI18n(); setI18n() is a second source. ${REPEAT_ADVICE}`,
    );
  });

  it("rejects setI18n after a host factory, naming the factory as the first source", () => {
    createNextI18nFromHost(composedHost, ROUTING);

    const conflict = captureThrown(() => setI18n(composedHost()));

    expect(conflict.message).toBe(
      `[comvi/next] i18n already configured by createNextI18nFromHost(); setI18n() is a second source. ${REPEAT_ADVICE}`,
    );
  });

  it("rejects setI18n after a host factory that has already resolved", () => {
    const { i18n } = createNextI18nFromHost(composedHost, ROUTING);
    // Reading `i18n` resolves the cell, so the conflict is reported from the
    // `resolved` state rather than the `factory` one.
    expect(i18n).toBeDefined();

    const conflict = captureThrown(() => setI18n(composedHost()));

    expect(conflict.message).toBe(
      `[comvi/next] i18n already configured by createNextI18nFromHost(); setI18n() is a second source. ${REPEAT_ADVICE}`,
    );
  });

  it("rejects a host factory after setI18n, naming setI18n as the first source", () => {
    setI18n(composedHost());

    const conflict = captureThrown(() => createNextI18nFromHost(composedHost, ROUTING));

    expect(conflict.message).toBe(
      `[comvi/next] i18n already configured by setI18n(); createNextI18nFromHost() is a second source. ${REPEAT_ADVICE}`,
    );
  });

  it("rejects a second host factory registration", () => {
    createNextI18nFromHost(composedHost, ROUTING);

    const conflict = captureThrown(() => createNextI18nFromHost(composedHost, ROUTING));

    expect(conflict.message).toBe(
      `[comvi/next] i18n already configured by createNextI18nFromHost(); createNextI18nFromHost() is a second source. ${REPEAT_ADVICE}`,
    );
  });
});
