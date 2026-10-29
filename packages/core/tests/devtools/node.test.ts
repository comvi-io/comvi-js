/**
 * `devtools()` outside a browser (node environment): a plugin named "devtools" whose setup
 * does nothing and returns no teardown.
 */
import { describe, expect, it } from "vitest";
import { devtools } from "../../src/devtools";
import { createI18n } from "../../src/instance";

describe("devtools() without a window", () => {
  it("is named devtools and sets nothing up", () => {
    const plugin = devtools();
    expect(plugin.name).toBe("devtools");
    expect(typeof window).toBe("undefined");
    expect(plugin.setup(createI18n({ locale: "en" }))).toBeUndefined();
  });
});
