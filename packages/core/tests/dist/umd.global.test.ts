import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import type * as ComviCoreModule from "../../src";

/**
 * Acceptance A12 — the UMD/global behavioral smoke.
 *
 * `dist/comvi-core.global.prod.js` is the artifact `unpkg`/`jsdelivr` serve, and
 * it is built by a THIRD vite invocation (`vite.config.umd.ts`) with
 * `mangle.toplevel: true` — a different config, a different nameCache and a
 * different scope model from the ESM builds the rest of the suite covers.
 * Nothing else in the repo executes it, so a break here ships silently to every
 * CDN consumer.
 *
 * This drives the real IIFE in a bare `node:vm` context: no bundler, no module
 * loader, no DOM — exactly what a `<script src=…>` tag provides. The namespace
 * is typed against the package's own public types, so the smoke also pins that
 * the global surface still matches what `@comvi/core` declares.
 *
 * Requires a fresh build — CI runs `pnpm --filter @comvi/core build` first.
 */
const UMD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../dist/comvi-core.global.prod.js",
);

type ComviCoreGlobal = Pick<typeof ComviCoreModule, "I18n" | "createI18n">;

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
  ComviCore?: ComviCoreGlobal;
}

function loadUmd(): ComviCoreGlobal {
  const sandbox: UmdSandbox = { console, setTimeout, clearTimeout, queueMicrotask };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(UMD, "utf8"), sandbox, {
    filename: "comvi-core.global.prod.js",
  });
  if (!sandbox.ComviCore) throw new Error("the UMD bundle did not publish a ComviCore global");
  return sandbox.ComviCore;
}

beforeAll(() => {
  if (!fs.existsSync(UMD)) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
});

describe("UMD global build (A12)", () => {
  it("publishes the root namespace on the context global", () => {
    const ComviCore = loadUmd();
    expect(typeof ComviCore.I18n).toBe("function");
    expect(typeof ComviCore.createI18n).toBe("function");
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
});
