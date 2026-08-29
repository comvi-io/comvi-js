/**
 * How `createImportMapLoader` RESOLVES a key, tested on the adapter itself
 * rather than through a host: `static-loader.test.ts` drives it through
 * `init()`, where the loader's own diagnosis is wrapped in the host's
 * "failed to load all namespaces" error and the shorthand expansion is
 * indistinguishable from a plain hit.
 *
 * Two rules decide everything: an exact `"locale:namespace"` entry wins, and a
 * locale-only entry stands in for that locale's DEFAULT namespace only.
 */
import { describe, it, expect } from "vitest";
import { createImportMapLoader } from "../../src/loader";

const catalog = { hello: "Hello" };

describe("createImportMapLoader()", () => {
  it("prefers the exact locale:namespace entry over the locale-only one", async () => {
    const load = createImportMapLoader(
      {
        en: async () => ({ hello: "from the locale entry" }),
        "en:common": async () => ({ hello: "from the exact entry" }),
      },
      () => "common",
    );

    await expect(load("en", "common")).resolves.toEqual({ hello: "from the exact entry" });
  });

  it("expands a locale-only entry for the default namespace", async () => {
    const load = createImportMapLoader({ en: async () => catalog }, () => "common");

    await expect(load("en", "common")).resolves.toEqual(catalog);
  });

  it("does not expand a locale-only entry for any other namespace", async () => {
    const load = createImportMapLoader({ en: async () => catalog }, () => "common");

    await expect(load("en", "admin")).rejects.toThrow(
      '[i18n] registerLoader: no entry for "en:admin"',
    );
  });

  it("names the missing key when neither an exact nor a locale entry matches", async () => {
    const load = createImportMapLoader({ "en:common": async () => catalog }, () => "common");

    await expect(load("fr", "common")).rejects.toThrow(
      '[i18n] registerLoader: no entry for "fr:common"',
    );
  });
});
