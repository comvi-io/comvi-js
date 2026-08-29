import { describe, expect, it } from "vitest";
import { createI18n, hasLoaderApi, hasPluginHostApi, missingCapability } from "../../src";
import { attachLoader } from "../../src/loader";
import { attachPlugins } from "../../src/plugins";

function makeBareHost() {
  return createI18n({ locale: "en", exposeGlobal: false });
}

describe("hasLoaderApi()", () => {
  it("accepts a host the loader was attached to", () => {
    expect(hasLoaderApi(attachLoader(makeBareHost()))).toBe(true);
  });

  it("rejects a host carrying only part of the loader surface", () => {
    const partial = { registerLoader: () => {} };

    expect(hasLoaderApi(partial as never)).toBe(false);
  });
});

describe("hasPluginHostApi()", () => {
  it("accepts a host the plugin API was attached to", () => {
    expect(hasPluginHostApi(attachPlugins(makeBareHost()))).toBe(true);
  });

  it("rejects a host carrying only part of the plugin surface", () => {
    const partial = { use: () => {} };

    expect(hasPluginHostApi(partial as never)).toBe(false);
  });
});

describe("missingCapability()", () => {
  it("names the loader subpath and its lower-level attach function", () => {
    expect(missingCapability("loader").message).toBe(
      '[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.',
    );
  });

  it("names the plugins subpath and its lower-level attach function", () => {
    expect(missingCapability("plugins").message).toBe(
      '[comvi] This i18n instance has no plugins capability. Compose it: .with(plugins()) from "@comvi/core/plugins", or the lower-level attachPlugins.',
    );
  });
});
