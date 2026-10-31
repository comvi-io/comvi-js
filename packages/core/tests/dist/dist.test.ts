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

describe("development diagnostics in the built files", () => {
  const HINT = "renders nothing without";
  const files = fs.readdirSync(DIST, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".js"));
  const has = (f: string) => fs.readFileSync(path.join(DIST, f), "utf8").includes(HINT);

  it("the <br> hint and the load_failed cause text are in a development file and in no production one", () => {
    expect(files.filter((f) => f.endsWith(".dev.js")).some(has)).toBe(true);
    expect(files.filter((f) => !f.endsWith(".dev.js")).filter(has)).toEqual([]);
    const prod = files
      .filter((f) => !f.endsWith(".dev.js"))
      .filter((f) => fs.readFileSync(path.join(DIST, f), "utf8").includes("cause not printable"));
    expect(prod).toEqual([]);
  });
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

  it("an unclosed <br> renders its key; only the development build explains it", async () => {
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    const messages: (string | undefined)[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: { k: "a<br>b" } },
      onError: (e) => messages.push(e.message),
    });
    expect(i18n.t("k")).toBe("k");
    expect(messages).toEqual([
      label === "dev"
        ? "`<br>` is never closed; write `<br/>` instead. It renders nothing without a `br` handler"
        : undefined,
    ]);
  });

  it(`two namespaces failing in one locale: the default reporter ${label === "dev" ? "prints two lines, each with its namespace and cause" : "prints nothing"}`, async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    const i18n = createI18n({
      locale: "de",
      namespaces: ["shop", "cart"],
      messages: { de: {} },
      loader: (_l, n) => Promise.reject(n == "shop" ? new Error("404 shop") : "cart down"),
    });
    await i18n.ready;
    expect(error.mock.calls.map((c) => c[0])).toEqual(
      label === "dev"
        ? [
            '[@comvi/core] load_failed (de, namespace "shop"): 404 shop',
            '[@comvi/core] load_failed (de, namespace "cart"): cart down',
          ]
        : [],
    );
    error.mockRestore();
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

  it("missing_key once every pair of the chain is settled: an incomplete inline fallback with the main locale not requested is silent, reported after the load; without a loader at once; a namespace with no catalog only warns in development (owner 30.10)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    const errors: unknown[] = [];
    let answer!: (c: Record<string, string>) => void;
    const i18n = createI18n({
      locale: "de",
      fallbackLocale: "en",
      catalogs: { shop: { en: { other: "x" } } },
      messages: { de: {}, en: {} },
      loader: () => new Promise((y) => (answer = y)),
      onError: (e) => errors.push(e),
    });
    expect(i18n.t("title", { ns: "shop" })).toBe("title"); // de:shop never requested
    expect(errors).toEqual([]);
    const p = i18n.load("shop");
    answer({ more: "y" });
    await p;
    expect(i18n.t("title", { ns: "shop" })).toBe("title");
    expect(errors).toEqual([{ code: "missing_key", key: "title", locale: "de", ns: "shop" }]);
    const bare: unknown[] = [];
    const plain = createI18n({ locale: "en", messages: { en: {} }, onError: (e) => bare.push(e) });
    plain.t("nope");
    plain.t("title", { ns: "acount" });
    expect(bare).toEqual([{ code: "missing_key", key: "nope", locale: "en", ns: "default" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(warn.mock.calls.map((c) => String(c[0]).includes('"acount"'))).toEqual(
      label === "dev" ? [true] : [],
    );
    warn.mockRestore();
  });

  it("a request in flight has priority over a catalog add()ed to its pair: silent until it settles (owner 30.10)", async () => {
    const { createI18n } = await load<typeof Core>(`comvi-core${suffix}.js`);
    const errors: unknown[] = [];
    let answer!: (c: Record<string, string>) => void;
    const i18n = createI18n({
      locale: "en",
      messages: { en: {} },
      loader: () => new Promise((y) => (answer = y)),
      onError: (e) => errors.push(e),
    });
    const p = i18n.load("shop");
    i18n.add("en", { other: "x" }, "shop");
    i18n.t("title", { ns: "shop" });
    expect(errors).toEqual([]);
    answer({});
    await p;
    i18n.t("title", { ns: "shop" });
    expect(errors).toEqual([{ code: "missing_key", key: "title", locale: "en", ns: "shop" }]);
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
