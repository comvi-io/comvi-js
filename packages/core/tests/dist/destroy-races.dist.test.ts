import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The destroy races, driven against the BUILT dist — both builds.
 *
 * `tests/features/destroy-races.test.ts` pins the behaviour at source level.
 * This suite exists because the fixes made `_isDestroyed` a CROSS-CHUNK
 * member: the base class in `comvi-core.js` owns it, and `comvi-core-loader.js`
 * / `comvi-core-plugins.js` read it after their own awaits. That is exactly the
 * mangling contract `base-composition.dist.test.ts` guards — terser renames the
 * member with one shared nameCache across every chunk — and a src-level run
 * cannot prove the chunks agreed. If the nameCache ever disagrees, every check
 * below reads `undefined` and the races come back silently.
 *
 * The `prod` build is the one that can fail that way; `dev` is run too because
 * it is a separate vite invocation with `__DEV__` true, so the two artifacts
 * are only known to behave alike if both are driven.
 *
 * Requires a fresh build.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type Host = {
  init(): Promise<unknown>;
  destroy(): Promise<void>;
  isInitialized: boolean;
  locale: string;
  on(event: string, cb: (data?: unknown) => void): () => void;
  setLocale(value: string): Promise<void>;
  addActiveNamespace(ns: string): Promise<void>;
  registerLoader(fn: (locale: string, ns: string) => unknown): void;
  registerPlugin(fn: (host: unknown) => unknown): unknown;
  addMessages(map: Record<string, Record<string, string>>): void;
  t(key: string, options?: Record<string, unknown>): string;
};

beforeAll(() => {
  if (!fs.existsSync(path.join(DIST, "comvi-core-plugins.js"))) {
    throw new Error("dist is missing — run `pnpm --filter @comvi/core build` before the tests");
  }
});

describe.each([["prod", ""] as const, ["dev", ".dev"] as const])(
  "%s dist: destroy racing an operation in flight",
  (_label, suffix) => {
    /** Dynamic on purpose — see the note in `base-composition.dist.test.ts`. */
    async function composed(options: Record<string, unknown>): Promise<Host> {
      const { createI18n } = await import(`../../dist/comvi-core${suffix}.js`);
      const { attachLoader } = await import(`../../dist/comvi-core-loader${suffix}.js`);
      const { attachPlugins } = await import(`../../dist/comvi-core-plugins${suffix}.js`);
      return attachPlugins(attachLoader(createI18n({ exposeGlobal: false, ...options }))) as Host;
    }

    it("does not finish an init() that destroy() interrupted", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const initialized = vi.fn();
      const onError = vi.fn();

      const i18n = await composed({ locale: "en", onError });
      i18n.registerPlugin(async () => {
        await gate;
      });
      i18n.on("initialized", initialized);

      const initPromise = i18n.init();
      await flush();

      await i18n.destroy();
      release();
      await initPromise;
      await flush();

      expect(i18n.isInitialized).toBe(false);
      expect(initialized).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it("runs a plugin cleanup that arrives after the destroy drain", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const cleanup = vi.fn();

      const i18n = await composed({ locale: "en" });
      i18n.registerPlugin(async () => {
        await gate;
        return cleanup;
      });

      const initPromise = i18n.init();
      await flush();
      await i18n.destroy();
      expect(cleanup).not.toHaveBeenCalled();

      release();
      await initPromise;
      await flush();

      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it("resolves a repeat destroy() only once the single cleanup has settled", async () => {
      const order: string[] = [];

      const i18n = await composed({ locale: "en" });
      i18n.registerPlugin(
        () => () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              order.push("cleanup");
              resolve();
            }, 0),
          ),
      );
      await i18n.init();

      const first = i18n.destroy();
      const second = i18n.destroy();

      await second;
      expect(order).toEqual(["cleanup"]);
      expect(second).toBe(first);
      await first;
    });

    it("abandons a locale switch that was in flight", async () => {
      let release!: (value: Record<string, string>) => void;
      const load = new Promise<Record<string, string>>((resolve) => {
        release = resolve;
      });

      const i18n = await composed({ locale: "en" });
      i18n.registerLoader(() => load);
      i18n.addMessages({ en: { hello: "Hello" } });
      await i18n.init();

      const switchPromise = i18n.setLocale("fr");
      await flush();

      await i18n.destroy();
      release({ hello: "Bonjour" });
      await switchPromise;

      expect(i18n.locale).toBe("en");
    });

    it("retries a namespace whose loader threw synchronously", async () => {
      let mode: "throw" | "ok" = "throw";
      const loader = vi.fn(() => {
        if (mode === "throw") throw new Error("sync loader boom");
        return Promise.resolve({ hello: "Hola" });
      });

      const i18n = await composed({ locale: "en", ns: [], onError: () => {} });
      i18n.registerLoader(loader);
      await i18n.init();

      await expect(i18n.addActiveNamespace("sync")).rejects.toThrow();
      expect(loader).toHaveBeenCalledTimes(1);

      mode = "ok";
      await i18n.addActiveNamespace("sync");
      expect(loader).toHaveBeenCalledTimes(2);
      expect(i18n.t("hello", { ns: "sync" })).toBe("Hola");
    });
  },
);
