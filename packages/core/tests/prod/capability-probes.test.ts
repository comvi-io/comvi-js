/**
 * The capability boundary in a PRODUCTION build.
 *
 * The wrapper-facing throw survives the `__DEV__` fold — an app that asks a
 * bare host for the loader capability gets a loud, actionable error in both
 * builds — but the dev-only SHIM bookkeeping does not: production installs no
 * stand-ins, so its probe is the plain callability test it was before the shims
 * existed, and it never pays to look for the brand.
 */
import { describe, it, expect } from "vitest";
import { createI18n, hasLoaderApi, hasPluginHostApi, missingCapability } from "../../src";
import { attachLoader } from "../../src/loader";
import { attachPlugins } from "../../src/plugins";
import { LOADER_MEMBERS, capabilityShim } from "../../src/utils/capability";

function makeBareHost() {
  return createI18n({ locale: "en", exposeGlobal: false });
}

describe("missingCapability()", () => {
  it("names the loader subpath in the short production wording", () => {
    expect(missingCapability("loader").message).toBe(
      "[comvi] missing loader capability — attach @comvi/core/loader",
    );
  });

  it("names the plugins subpath in the short production wording", () => {
    expect(missingCapability("plugins").message).toBe(
      "[comvi] missing plugins capability — attach @comvi/core/plugins",
    );
  });
});

describe("hasLoaderApi()", () => {
  it("accepts a host the loader was attached to", () => {
    expect(hasLoaderApi(attachLoader(makeBareHost()))).toBe(true);
  });

  it("rejects a plugins-only host, which carries no stand-ins to mistake for the real thing", () => {
    expect(hasLoaderApi(attachPlugins(makeBareHost()))).toBe(false);
  });

  it("rejects a host carrying only part of the loader surface", () => {
    const partial = { registerLoader: () => {} };

    expect(hasLoaderApi(partial as never)).toBe(false);
  });

  it("accepts a branded stand-in as a real member — production installs none, so the brand is never probed", () => {
    const shimmed = Object.fromEntries(
      LOADER_MEMBERS.map((name) => [name, capabilityShim("loader")]),
    );

    expect(hasLoaderApi(shimmed as never)).toBe(true);
  });
});

describe("hasPluginHostApi()", () => {
  it("accepts a host the plugin API was attached to", () => {
    expect(hasPluginHostApi(attachPlugins(makeBareHost()))).toBe(true);
  });

  it("rejects a bare host", () => {
    expect(hasPluginHostApi(makeBareHost())).toBe(false);
  });
});
