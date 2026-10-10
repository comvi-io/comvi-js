import { beforeEach, describe, expect, it, vi } from "vitest";

type DefaultsModule = typeof import("../src/defaults");

/**
 * The module is re-imported per test so the constants are re-evaluated inside
 * the test itself (module-scope values are otherwise cached from the first
 * process-wide import).
 */
describe("defaults", () => {
  let defaults: DefaultsModule;

  beforeEach(async () => {
    vi.resetModules();
    defaults = await import("../src/defaults");
  });

  it("exposes the documented default file template", () => {
    expect(defaults.DEFAULT_FILE_TEMPLATE).toBe("{namespace}/{languageTag}.json");
  });

  it("exposes the documented default namespace", () => {
    expect(defaults.DEFAULT_NAMESPACE).toBe("default");
  });

  it("recognizes the default template written with backslashes", () => {
    expect(defaults.isDefaultFileTemplate("{namespace}\\{languageTag}.json")).toBe(true);
  });

  it("rejects a template that differs from the default", () => {
    expect(defaults.isDefaultFileTemplate("{languageTag}/{namespace}.json")).toBe(false);
  });
});
