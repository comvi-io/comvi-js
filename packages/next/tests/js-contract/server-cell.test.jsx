// framework-slim P5 step 4 (iv), (x), (xi) — the server once-cell's loud
// failures, asserted against BOTH published build families.
//
// The messages are written out verbatim rather than imported from cache.ts:
// importing them would compare the module against itself and pass whatever it
// says. They are IDENTICAL in both runs on purpose — a conflict is a
// programming error in production too, and a dev-only diagnostic would be the
// dev/prod divergence §2.4 bans. `__COMVI_CORE_BUILD__` (vitest.config.ts)
// says which core artifact this run resolved, and `__DEV__` is false in the
// production project.
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

const CYCLE = "[comvi/next] i18n host factory cycle: the factory read the instance it is building.";

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

  it("rejects setI18n after a host registration, before resolution", () => {
    createNextI18nFromHost(host, ROUTING);

    expect(() => setI18n(host())).toThrow(conflict(FACTORY, SET_I18N));
  });

  it("rejects a second host registration", () => {
    createNextI18nFromHost(host, ROUTING);

    expect(() => createNextI18nFromHost(host, ROUTING)).toThrow(conflict(FACTORY, FACTORY));
  });

  it("rejects setI18n with a DIFFERENT instance after the host resolved", () => {
    const result = createNextI18nFromHost(host, ROUTING);
    const resolved = result.i18n;

    expect(() => setI18n(host())).toThrow(conflict(FACTORY, SET_I18N));
    expect(getI18nInstance()).toBe(resolved);
  });

  it("accepts setI18n with the SAME instance after the host resolved", () => {
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

describe(`server i18n once-cell — resolution failures (${__COMVI_CORE_BUILD__} core build)`, () => {
  beforeEach(() => {
    _resetServerI18n();
  });

  it("throws a cycle error when the host factory reads the instance it is building", () => {
    const result = createNextI18nFromHost(() => {
      getI18nInstance();
      return host();
    }, ROUTING);

    expect(() => result.i18n).toThrow(CYCLE);
  });

  it("throws the same cycle error through the result getter", () => {
    let result;
    result = createNextI18nFromHost(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- the read IS the probe
      result.i18n;
      return host();
    }, ROUTING);

    expect(() => result.i18n).toThrow(CYCLE);
  });

  it("propagates a factory throw and retries on the next access", () => {
    let attempts = 0;
    const result = createNextI18nFromHost(() => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("host factory boom");
      }
      return host();
    }, ROUTING);

    expect(() => result.i18n).toThrow("host factory boom");
    expect(attempts).toBe(1);

    const resolved = result.i18n;

    expect(attempts).toBe(2);
    expect(resolved).toBeDefined();
    expect(getI18nInstance()).toBe(resolved);
    expect(attempts).toBe(2);
  });

  it("leaves no half-initialized cell behind a failed resolution", () => {
    const result = createNextI18nFromHost(() => {
      throw new Error("host factory boom");
    }, ROUTING);

    expect(() => result.i18n).toThrow("host factory boom");
    expect(() => getI18nInstance()).toThrow("host factory boom");
    // Still `factory`, so the cell is neither empty nor resolved: a second
    // configuration source is still a conflict, not a silent takeover.
    expect(() => setI18n(host())).toThrow(conflict(FACTORY, SET_I18N));
  });
});
