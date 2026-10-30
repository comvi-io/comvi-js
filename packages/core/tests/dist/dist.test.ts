/**
 * The BUILT dist, both builds (production `comvi-core*.js`, development `*.dev.js`):
 * the instance across chunks, destroy racing a load, and the default reporter — the
 * development build prints a missing key once, the production build prints nothing.
 * Ported by meaning from 0.7 dist/destroy-races.dist and dist/missing-key-warning.dist.
 * Requires a fresh build (turbo runs `build` before `test`).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type * as Core from "../../src/index";
import type * as Cdn from "../../src/cdn";
import type * as Devtools from "../../src/devtools";

const DIST = path.resolve(__dirname, "../../dist");
const load = async <T>(file: string): Promise<T> =>
  import(pathToFileURL(path.join(DIST, file)).href);
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"));

beforeAll(() => {
  if (!fs.existsSync(path.join(DIST, "comvi-core-cdn.js")))
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
});

describe.each([
  ["prod", ""],
  ["dev", ".dev"],
] as const)("%s dist", (label, suffix) => {
  it("destroy() while a load is in flight: the load is aborted and never lands", async () => {
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    let answer!: (c: Record<string, string>) => void;
    let signal!: AbortSignal;
    const i18n = createI18n({
      locale: "en",
      loader: (_l, _n, s) => {
        signal = s;
        return new Promise((y) => (answer = y));
      },
      onError: () => {},
    });
    const sub = vi.fn();
    i18n.on(sub);
    i18n.destroy();
    expect(signal.aborted).toBe(true);
    answer({ a: "late" });
    await new Promise((r) => setTimeout(r, 0));
    expect(i18n.t("a")).toBe("a");
    expect(sub).not.toHaveBeenCalled();
  });

  it(`a missing key renders the key; the default reporter ${label === "dev" ? "prints it once" : "prints nothing"}`, async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    const i18n = createI18n({ locale: "en", messages: { en: {} } });
    expect(i18n.t(`missing.${label}`)).toBe(`missing.${label}`);
    i18n.t(`missing.${label}`);
    expect(error.mock.calls).toEqual(
      label === "dev" ? [[`[@comvi/core] missing_key "missing.${label}" (en)`]] : [],
    );
  });

  it("missing_key once the loads settle: a key absent from a loaded catalog is reported; a namespace typo is not (owner 30.10)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    const errors: unknown[] = [];
    const i18n = createI18n({
      locale: "en",
      loader: async () => ({ hi: "Hi" }),
      onError: (e) => errors.push(e),
    });
    expect(i18n.t("nope")).toBe("nope"); // en:default in flight: not yet
    expect(errors).toEqual([]);
    await i18n.ready;
    expect(i18n.t("nope")).toBe("nope");
    expect(errors).toEqual([{ code: "missing_key", key: "nope", locale: "en", ns: "default" }]);
    expect(i18n.t("title", { ns: "acount" })).toBe("title");
    expect(errors).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(warn.mock.calls.map((c) => String(c[0]).includes('"acount"'))).toEqual(
      label === "dev" ? [true] : [],
    );
    warn.mockRestore();
  });

  it("the CDN subpath and the instance work across chunks", async () => {
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    const { cdn } = await load<typeof Cdn>(`comvi-core-cdn${suffix}.js`);
    vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
    try {
      const i18n = createI18n({
        locale: "en",
        loader: cdn("https://cdn.example", { fallback: { en: () => ({ a: "A" }) } }),
      });
      await i18n.ready;
      expect(i18n.t("a")).toBe("A");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("inlines the package version into devtools", async () => {
    const { VERSION } = await load<typeof Devtools>(`comvi-core-devtools${suffix}.js`);
    expect(VERSION).toBe(pkg.version);
  });
});
