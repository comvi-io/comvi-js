import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
// The global's surface IS `src/umd.ts` — the non-exported CDN entry the third
// vite invocation builds. Typing against it is what makes this smoke also pin
// "the published global still matches the source that composes it".
import type * as ComviUmdModule from "../../src/umd";

/**
 * The UMD/global behavioural smoke.
 *
 * `dist/comvi-core.global.prod.js` is the artifact `unpkg`/`jsdelivr` serve, and
 * it is built by a THIRD vite invocation (`vite.config.umd.ts`) with
 * `mangle.toplevel: true` — a different config, a different nameCache and a
 * different scope model from the ESM builds the rest of the suite covers.
 * Nothing else in the repo executes it, so a break here ships silently to every
 * CDN consumer.
 *
 * The global has its own ENTRY, `src/umd.ts`, because the ESM root is the bare
 * base host while a `<script src>` consumer has no import graph to extend. The
 * composition that entry owns — ambient tags, ICU, loader, plugin host,
 * discovery — is exactly what this file has to pin.
 *
 * This drives the real IIFE in a bare `node:vm` context: no bundler, no module
 * loader, no DOM — exactly what a `<script src=…>` tag provides. The namespace
 * is typed against the package's own public types, so the smoke also pins that
 * the global surface still matches what `@comvi/core` declares.
 *
 * Requires a fresh build.
 */
const UMD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../dist/comvi-core.global.prod.js",
);

type ComviCoreGlobal = Pick<
  typeof ComviUmdModule,
  | "I18n"
  | "createI18n"
  | "isVirtualNode"
  | "TranslationCache"
  | "icuCompiler"
  | "flattenCatalog"
  | "translationResultToString"
>;

/**
 * The seeded globals are exactly the host APIs a browser provides on top of the
 * ECMAScript intrinsics a vm context already has. Anything else the bundle
 * reaches for is a portability bug and surfaces here as a ReferenceError.
 *
 * `ComviCore` is optional because the bundle is what assigns it: `createContext`
 * contextifies this object in place, so the UMD wrapper's write to the context
 * global lands right here — no cast needed to read it back.
 */
interface UmdSandbox {
  console: typeof console;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  queueMicrotask: typeof queueMicrotask;
  /** Seeded ONLY for the discovery cases: the protocol is window-gated. */
  window?: UmdSandbox;
  __COMVI__?: unknown;
  ComviCore?: ComviCoreGlobal;
}

/**
 * `browser: true` seeds `window` (pointing at the context global itself, as a
 * page does), which is the only thing the discovery capability needs to
 * announce. The base cases stay in the bare sandbox, so anything the bundle
 * reaches for beyond the four seeded host APIs still surfaces as a
 * ReferenceError.
 */
function loadUmdIn(sandbox: UmdSandbox): ComviCoreGlobal {
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(UMD, "utf8"), sandbox, {
    filename: "comvi-core.global.prod.js",
  });
  if (!sandbox.ComviCore) throw new Error("the UMD bundle did not publish a ComviCore global");
  return sandbox.ComviCore;
}

function loadUmd(): ComviCoreGlobal {
  return loadUmdIn({ console, setTimeout, clearTimeout, queueMicrotask });
}

function loadBrowserUmd(): { ComviCore: ComviCoreGlobal; sandbox: UmdSandbox } {
  const sandbox: UmdSandbox = { console, setTimeout, clearTimeout, queueMicrotask };
  sandbox.window = sandbox;
  return { ComviCore: loadUmdIn(sandbox), sandbox };
}

// The published namespace is immutable, so the membership table below shares
// one evaluation of the bundle instead of re-running the IIFE per row.
let published: ComviCoreGlobal;

beforeAll(() => {
  if (!fs.existsSync(UMD)) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
  published = loadUmd();
});

describe("UMD global build (A12)", () => {
  // A `<script src>` consumer has no import graph, so anything missing from
  // the namespace is unreachable for them.
  it.each([
    ["I18n", "function"],
    ["createI18n", "function"],
    ["icuCompiler", "object"],
    ["flattenCatalog", "function"],
    ["isVirtualNode", "function"],
    ["TranslationCache", "function"],
    ["translationResultToString", "function"],
  ])("publishes %s on the context global, typeof %s", (member, kind) => {
    expect(typeof published[member as keyof ComviCoreGlobal]).toBe(kind);
  });

  it("constructs, loads, translates, switches locale and destroys in order", async () => {
    const { I18n } = loadUmd();

    const store: Record<string, Record<string, string>> = {
      en: {
        greeting: "Hello, {name}!",
        items: "{count, plural, one {# item} other {# items}}",
      },
      de: {
        greeting: "Hallo, {name}!",
        items: "{count, plural, one {# Eintrag} other {# Einträge}}",
      },
    };

    const order: string[] = [];
    const i18n = new I18n({ locale: "en", fallbackLocale: "en", exposeGlobal: false });

    // Every translation arrives through the loader, so the locale switch below
    // is loader-driven rather than served from constructor-supplied data.
    i18n.registerLoader(async (locale) => store[locale] ?? {});
    i18n.use((host) => {
      order.push("plugin");
      host.setPluginData("umd", { ok: true });
      return () => void order.push("cleanup");
    });

    await i18n.init();

    expect(order).toEqual(["plugin"]);
    expect(i18n.t("greeting", { name: "Alice" })).toBe("Hello, Alice!");
    // ICU plural machinery survives toplevel mangling.
    expect(i18n.t("items", { count: 5 })).toBe("5 items");
    expect(i18n.getPluginData("umd")).toEqual({ ok: true });

    await i18n.setLocaleAsync("de");
    expect(i18n.locale).toBe("de");
    expect(i18n.t("greeting", { name: "Bea" })).toBe("Hallo, Bea!");
    expect(i18n.t("items", { count: 1 })).toBe("1 Eintrag");

    i18n.on("destroyed", () => void order.push("destroyed"));
    await i18n.destroy();

    // Two-phase destroy: plugin cleanup runs before the lifecycle event, and
    // capability state is only reset once destroy() has resolved.
    expect(order).toEqual(["plugin", "cleanup", "destroyed"]);
    expect(i18n.getLoader()).toBeUndefined();
    expect(i18n.getPluginData("umd")).toBeUndefined();
  });

  it("registerLoader accepts a static import map", async () => {
    const { I18n } = loadUmd();
    const i18n = new I18n({ locale: "en", exposeGlobal: false });

    i18n.registerLoader({
      en: () => Promise.resolve({ default: { k: "EN" } }),
      de: () => Promise.resolve({ default: { k: "DE" } }),
    });
    await i18n.init();

    expect(i18n.t("k")).toBe("EN");
    await i18n.setLocaleAsync("de");
    expect(i18n.t("k")).toBe("DE");
  });

  it("flattens nested constructor catalogs", () => {
    const { I18n } = loadUmd();
    const i18n = new I18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { nav: { home: "Home" } } },
    });

    expect(i18n.t("nav.home")).toBe("Home");
  });

  it("renders ambient string-API tag syntax through the param channel", () => {
    // `src/umd.ts` imports `./register-tags`, so the CDN bundle keeps the
    // ambient tag grammar the ESM root no longer registers.
    const { I18n } = loadUmd();
    const i18n = new I18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { rich: "click <b>here</b> now" } },
    });

    let handled: unknown;
    const out = i18n.t("rich", {
      b: (props: unknown) => {
        handled = props;
        return "HANDLED";
      },
    });

    expect(out).toBe("click HANDLED now");
    // The whole handler argument, not just its presence: the CDN build has to
    // deliver the same `{ children, name }` shape the ESM entries do.
    expect(handled).toEqual({ children: "here", name: "b" });
  });

  it("produces virtual nodes for ambient tags through tRaw", () => {
    const { I18n, isVirtualNode } = loadUmd();
    const i18n = new I18n({
      locale: "en",
      exposeGlobal: false,
      tagInterpolation: { basicHtmlTags: ["strong"] },
      translation: { en: { rich: "read <strong>this</strong>" } },
    });

    const parts = i18n.tRaw("rich");

    expect(parts).toEqual([
      "read ",
      { type: "element", tag: "strong", props: {}, children: ["this"] },
    ]);
    expect(isVirtualNode((parts as unknown[])[1])).toBe(true);
  });

  it("announces on window.__COMVI__ and removes its identity on destroy", async () => {
    const { ComviCore, sandbox } = loadBrowserUmd();
    expect(sandbox.__COMVI__, "the queue must start empty").toBeUndefined();

    const i18n = new ComviCore.I18n({ locale: "en", instanceId: "cdn-host" });

    const queue = sandbox.__COMVI__ as Array<{ i: unknown; v: unknown }>;
    expect(Array.isArray(queue)).toBe(true);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.i, "the queued entry holds the instance itself").toBe(i18n);
    expect(typeof queue[0]!.v).toBe("string");
    expect(i18n.instanceId).toBe("cdn-host");

    await i18n.destroy();
    expect(queue, "identity-based removal on destroy").toHaveLength(0);
  });

  it("honours a pre-installed v2 hook (mixed-version safe)", async () => {
    const { ComviCore, sandbox } = loadBrowserUmd();
    const pushed: unknown[] = [];
    const removed: unknown[] = [];
    sandbox.__COMVI__ = {
      push: (entry: unknown) => pushed.push(entry),
      remove: (entry: unknown) => removed.push(entry),
    };

    const i18n = new ComviCore.I18n({ locale: "en", instanceId: "hooked" });
    expect(pushed).toHaveLength(1);
    expect((pushed[0] as { i: unknown }).i).toBe(i18n);

    await i18n.destroy();
    expect(removed).toHaveLength(1);
    expect(removed[0], "removal is identity-based").toBe(pushed[0]);
  });

  it("stays silent under exposeGlobal:false in a browser-like context", () => {
    const { ComviCore, sandbox } = loadBrowserUmd();
    const i18n = new ComviCore.I18n({ locale: "en", exposeGlobal: false });

    expect(sandbox.__COMVI__).toBeUndefined();
    expect(i18n.instanceId).toBeUndefined();
  });

  it("introduces no NEW context-global leak", () => {
    // The UMD IIFE leaks two mangled top-level names onto the page global. This
    // gate is PRESERVATION — the leak set must not grow. Closing it outright is
    // a UMD wrapper/mangler defect, tracked separately, not a composition one.
    // The exact names are mangler output and are EXPECTED to churn on a terser
    // upgrade: re-baseline by reading the failure's `leaked` array, and only
    // after checking the list did not get longer.
    const seeded = ["console", "setTimeout", "clearTimeout", "queueMicrotask", "ComviCore"];
    const sandbox: UmdSandbox = { console, setTimeout, clearTimeout, queueMicrotask };
    loadUmdIn(sandbox);

    const leaked = Object.keys(sandbox)
      .filter((key) => !seeded.includes(key))
      .sort();
    expect(leaked).toEqual(["e", "t"]);
  });
});
