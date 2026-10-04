import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * The missing-key warning, against the BUILT development and production entries.
 *
 * `pnpm examples:e2e` drives the examples' production builds only, so its step
 * `l` ("an unknown key renders as itself") can see the rendered key but never
 * the console warning a development build adds. This suite is that half: it
 * loads `dist/comvi-core.dev.js` — what the `development` export condition
 * hands a bundler in dev — and `dist/comvi-core.js`, and asserts the same key
 * step `l` uses (`fallback.nowhere`) warns in the first and stays silent in
 * the second.
 *
 * The warning is opt-in (`strict: "dev"`; the default is `"off"`), and none of
 * the examples set it, so the default-silence case is pinned here too.
 *
 * Requires a fresh build.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
const KEY = "fallback.nowhere";

/**
 * A built entry, typed by the declaration the package ships for it. Loaded by
 * URL rather than a literal specifier: the emitted `.js` has no sibling
 * `.d.ts`, so a literal `import("../../dist/comvi-core.dev.js")` is TS7016.
 */
type CoreEntry = typeof import("../../dist/index.js");
const load = (file: string): Promise<CoreEntry> =>
  import(pathToFileURL(path.join(DIST, file)).href);

beforeAll(() => {
  for (const file of ["comvi-core.js", "comvi-core.dev.js"]) {
    if (!fs.existsSync(path.join(DIST, file))) {
      throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
    }
  }
});

describe("dev dist: missing-key warning", () => {
  it('warns `Translation not found` under strict: "dev" and renders the key', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createI18n } = await load("comvi-core.dev.js");
    const i18n = createI18n({
      locale: "uk",
      exposeGlobal: false,
      strict: "dev",
      messages: { uk: { hello: "Привіт" } },
    });

    expect(i18n.t(KEY)).toBe(KEY);
    expect(warn).toHaveBeenCalledWith(`[i18n] Translation not found: "${KEY}"`, {
      key: KEY,
      locale: "uk",
      namespace: "default",
    });
  });

  it("stays silent by default, which is how every example is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createI18n } = await load("comvi-core.dev.js");
    const i18n = createI18n({ locale: "en", exposeGlobal: false, messages: { en: {} } });

    expect(i18n.t(KEY)).toBe(KEY);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("prod dist: missing-key warning", () => {
  it('renders the key and warns nothing, even under strict: "dev"', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createI18n } = await load("comvi-core.js");
    const i18n = createI18n({
      locale: "uk",
      exposeGlobal: false,
      strict: "dev",
      messages: { uk: { hello: "Привіт" } },
    });

    expect(i18n.t(KEY)).toBe(KEY);
    expect(warn).not.toHaveBeenCalled();
  });
});
