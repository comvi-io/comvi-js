// The server once-cell's loud failures, asserted against BOTH published build
// families.
//
// The messages are written out verbatim rather than imported from cache.ts:
// importing them would compare the module against itself and pass whatever it
// says. They are IDENTICAL in both runs on purpose — a conflict is a programming
// error in production too, and a dev-only diagnostic would be a dev/prod
// divergence. `__COMVI_CORE_BUILD__` (vitest.config.ts) says which core artifact
// this run resolved, and `__DEV__` is false in the production project.
import { describe, it, expect, beforeEach } from "vitest";
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { _resetServerI18n, getI18nInstance, setI18n } from "../../src/server/cache";
import { createNextI18nFromHost } from "../../src/server/createNextI18nFromHost";

/* global __COMVI_CORE_BUILD__ */

const FACTORY = "createNextI18nFromHost()";
const SET_I18N = "setI18n()";
const ROUTING = { locales: ["en", "fr"], defaultLocale: "en" };

const conflict = (configured, incoming) =>
  `[comvi/next] i18n already configured by ${configured}; ${incoming} is a second source. ` +
  "Configure it once — only a same-instance setI18n() repeats.";

const NOT_CONFIGURED =
  "[comvi/next] i18n not configured. Call setI18n(i18n) or createNextI18nFromHost(host, routing).";

const host = () =>
  attachLoader(createI18n({ locale: "en", defaultNs: "common", exposeGlobal: false }));

describe(`server i18n once-cell — conflicts (${__COMVI_CORE_BUILD__} core build)`, () => {
  beforeEach(() => {
    _resetServerI18n();
  });

  it("rejects a host registration after setI18n", () => {
    setI18n(host());

    expect(() => createNextI18nFromHost(host, ROUTING)).toThrow(conflict(SET_I18N, FACTORY));
  });

  it("rejects setI18n with a DIFFERENT instance after a host registration", () => {
    const result = createNextI18nFromHost(host, ROUTING);
    const resolved = result.i18n;

    expect(() => setI18n(host())).toThrow(conflict(FACTORY, SET_I18N));
    expect(getI18nInstance()).toBe(resolved);
  });

  it("rejects a second host registration WITHOUT building its host", () => {
    createNextI18nFromHost(host, ROUTING);
    let built = 0;

    expect(() =>
      createNextI18nFromHost(() => {
        built += 1;
        return host();
      }, ROUTING),
    ).toThrow(conflict(FACTORY, FACTORY));
    expect(built).toBe(0);
  });

  it("accepts setI18n with the SAME instance after a host registration", () => {
    const result = createNextI18nFromHost(host, ROUTING);
    const resolved = result.i18n;

    expect(() => setI18n(resolved)).not.toThrow();
    expect(getI18nInstance()).toBe(resolved);
  });

  it("rejects a second setI18n with a DIFFERENT instance (was a silent overwrite in 0.4.x)", () => {
    const first = host();
    setI18n(first);

    expect(() => setI18n(host())).toThrow(conflict(SET_I18N, SET_I18N));
    expect(getI18nInstance()).toBe(first);
  });

  it("accepts a repeated setI18n with the SAME instance", () => {
    const only = host();
    setI18n(only);

    expect(() => setI18n(only)).not.toThrow();
    expect(getI18nInstance()).toBe(only);
  });
});

describe(`server i18n once-cell — construction failures (${__COMVI_CORE_BUILD__} core build)`, () => {
  beforeEach(() => {
    _resetServerI18n();
  });

  it("a factory that reads the instance it is building sees the not-configured error", () => {
    expect(() =>
      createNextI18nFromHost(() => {
        getI18nInstance();
        return host();
      }, ROUTING),
    ).toThrow(NOT_CONFIGURED);
  });

  it("propagates a factory throw out of the call and leaves the cell EMPTY", () => {
    expect(() =>
      createNextI18nFromHost(() => {
        throw new Error("host factory boom");
      }, ROUTING),
    ).toThrow("host factory boom");

    expect(() => getI18nInstance()).toThrow(NOT_CONFIGURED);
    // Nothing was configured, so either source may still configure it.
    const only = host();
    expect(() => setI18n(only)).not.toThrow();
    expect(getI18nInstance()).toBe(only);
  });
});
