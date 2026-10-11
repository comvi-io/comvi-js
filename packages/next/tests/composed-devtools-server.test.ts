// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createNextI18n } from "../src/createNextI18n";
import { devtools } from "../src/server";

/**
 * The SERVER half of the opt-in discovery contract: the shared `i18n/config.ts`
 * is evaluated in the server build too, so `.use(devtools())` runs there once
 * per process. With no `window` it must publish nothing and assign no id.
 */

const ROUTING = { locales: ["en", "de"], defaultLocale: "en" } as const;

afterEach(() => {
  delete (globalThis as { __COMVI__?: unknown }).__COMVI__;
});

describe("createNextI18n on the server — discovery", () => {
  it("createNextI18n without devtools() and no window → nothing published", () => {
    const { i18n } = createNextI18n({ ...ROUTING });

    expect(typeof window).toBe("undefined");
    expect((globalThis as { __COMVI__?: unknown }).__COMVI__).toBeUndefined();
    expect(i18n.instanceId).toBeUndefined();
  });

  it("createNextI18n(…).use(devtools()) with no window → nothing published, no instanceId", () => {
    const { i18n } = createNextI18n({ ...ROUTING }).use(devtools({ instanceId: "app" }));

    expect(typeof window).toBe("undefined");
    expect((globalThis as { __COMVI__?: unknown }).__COMVI__).toBeUndefined();
    expect(i18n.instanceId).toBeUndefined();
  });
});
