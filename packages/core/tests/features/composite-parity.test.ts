import { describe, it, expect, beforeEach } from "vitest";
// Ambient tag syntax, registered once for BOTH hosts: it is a module-level
// side effect of `@comvi/core/tags`, which is exactly how a composed app opts
// in and how `src/umd.ts` keeps the CDN global batteries-included.
import "../../src/tags";
import { I18n as ComposedI18n } from "../../src/core/full";
import { createI18n, flattenCatalog } from "../../src";
import { icuCompiler } from "../../src/icu";
import { attachLoader, createImportMapLoader, loader } from "../../src/loader";
import { plugins } from "../../src/plugins";
import { devtools } from "../../src/devtools";
import type { I18nPluginHost, LoaderFn, TranslationValue } from "../../src/types";
import type { LoaderImportMap } from "../../src/core/importMapLoader";

/**
 * The batteries-included host vs the published composition RECIPE, proved to be
 * the same thing: every scenario runs twice — once on the internal composite
 * (`src/core/full.ts`) and once on the base host composed with explicit
 * capability imports — and passes only when both produce a deep-equal
 * observation.
 *
 * The COMPOSITION ORDER below is normative:
 *
 *   capabilities first → catalog ingested → discovery LAST
 *
 * Attaching discovery before the catalog would move `instanceId` out of its
 * documented position as the final public own property. (Catalog ingestion no
 * longer depends on the order: the base host flattens nested catalogs itself.)
 */

interface HostOptions {
  locale?: string;
  fallbackLocale?: string;
  messages?: Record<string, Record<string, TranslationValue>>;
  defaultParams?: Record<string, unknown>;
  instanceId?: string;
  exposeGlobal?: boolean;
  importMap?: LoaderImportMap;
}

/** What both makers produce: the fully composed surface. */
type FullHost = I18nPluginHost & {
  registerLoader(loader: LoaderFn): void;
  t(key: string, params?: Record<string, unknown>): string;
  // `use(f)` is `f(this)`; the installers this harness pipes through it are
  // the low-level attaches, which install in place and hand the host back.
  use(installer: (host: never) => unknown): FullHost;
};

/** The internal composite — one constructor call, 0.4 semantics. */
function makeComposite(options: HostOptions = {}): FullHost {
  const { importMap, instanceId, exposeGlobal, ...rest } = options;
  const host = new ComposedI18n({ locale: "en", instanceId, exposeGlobal, ...rest } as never);
  if (importMap) host.registerLoader(importMap);
  return host as unknown as FullHost;
}

/** The published recipe — base host + explicit capability imports. */
function makeRecomposed(options: HostOptions = {}): FullHost {
  const { importMap, instanceId, exposeGlobal, messages, ...rest } = options;
  const host = createI18n({ locale: "en", compiler: icuCompiler, ...rest } as never)
    .use(importMap ? loader(importMap) : attachLoader)
    .use(plugins());
  if (messages !== undefined) host.addMessages(messages);
  host.use(devtools({ instanceId, exposeGlobal }));
  return host as unknown as FullHost;
}

type Maker = (options?: HostOptions) => FullHost;

const HOSTS: Record<string, Maker> = {
  "internal composite": makeComposite,
  "recomposed base host": makeRecomposed,
};

const win = window as { __COMVI__?: unknown };

beforeEach(() => {
  delete win.__COMVI__;
});

/** What a scenario is allowed to observe: a value, or a throw with that message. */
type Observation<T> = { value: T } | { threw: string };

/**
 * Run one scenario on both hosts and assert BOTH halves:
 *
 *  1. the first host observes exactly `expected`, and
 *  2. the second host observes exactly what the first one did.
 *
 * (1) is not redundant. Without it a regression that hits BOTH hosts — the
 * commonest kind, since they share almost all of their code — is invisible:
 * two identical throws, or two identical wrong values, satisfy (2) perfectly.
 * A throw is folded into the observation on purpose, so "one host throws where
 * the other returns" also fails loudly, but that makes an unexpected throw
 * indistinguishable from a value unless `expected` says which one it is.
 */
async function parity<T>(
  scenario: (make: Maker, host: string) => T | Promise<T>,
  expected: Observation<T>,
): Promise<void> {
  const observations: Record<string, Observation<T>> = {};
  for (const [name, make] of Object.entries(HOSTS)) {
    // The scenarios below construct exposed hosts; each run starts clean.
    delete win.__COMVI__;
    try {
      observations[name] = { value: await scenario(make, name) };
    } catch (error) {
      observations[name] = { threw: (error as Error).message };
    }
  }
  delete win.__COMVI__;

  const [first, second] = Object.keys(HOSTS);
  expect(observations[first!], `${first} must observe the expected result`).toEqual(expected);
  expect(observations[second!], `${second} must observe exactly what ${first} does`).toEqual(
    observations[first!],
  );
}

describe("composite parity — translation semantics", () => {
  it("ICU plural + select + selectordinal", async () => {
    await parity(
      (make) => {
        const i18n = make({
          messages: {
            en: {
              items: "{count, plural, one {# item} other {# items}}",
              who: "{gender, select, male {he} female {she} other {they}}",
              nth: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
            },
          },
        });
        return [
          i18n.t("items", { count: 1 }),
          i18n.t("items", { count: 7 }),
          i18n.t("who", { gender: "female" }),
          i18n.t("nth", { n: 3 }),
        ];
      },
      { value: ["1 item", "7 items", "she", "3rd"] },
    );
  });

  it("plain {param} interpolation, present and missing", async () => {
    await parity(
      (make) => {
        const i18n = make({ messages: { en: { g: "Hello, {name}!" } } });
        return [i18n.t("g", { name: "world" }), i18n.t("g")];
      },
      { value: ["Hello, world!", "Hello, {name}!"] },
    );
  });

  it("ambient string-API tags, with and without a handler", async () => {
    await parity(
      (make) => {
        const i18n = make({ messages: { en: { rich: "click <b>here</b> now" } } });
        return [
          // No handler: the tag falls back to its inner text on both hosts.
          i18n.t("rich"),
          i18n.t("rich", { b: ({ children }: { children: string }) => `**${children}**` }),
        ];
      },
      { value: ["click here now", "click **here** now"] },
    );
  });

  it("defaultParams applied and overridable", async () => {
    await parity(
      (make) => {
        const i18n = make({
          messages: { en: { p: "{brand} says {msg}" } },
          defaultParams: { brand: "Comvi" },
        });
        return [i18n.t("p", { msg: "hi" }), i18n.t("p", { brand: "Other", msg: "hi" })];
      },
      { value: ["Comvi says hi", "Other says hi"] },
    );
  });

  it("fallbackLocale resolution", async () => {
    await parity(
      (make) => {
        const i18n = make({
          locale: "de",
          fallbackLocale: "en",
          messages: { en: { only: "EN only" }, de: { d: "DE" } },
        });
        return [i18n.t("only"), i18n.t("d")];
      },
      { value: ["EN only", "DE"] },
    );
  });
});

describe("composite parity — catalogs", () => {
  it("nested CONSTRUCTOR catalogs flatten (the ordering-sensitive scenario)", async () => {
    await parity(
      (make) => {
        const i18n = make({ messages: { en: { nav: { home: "Home", deep: { x: "X" } } } } });
        return [
          i18n.t("nav.home"),
          i18n.t("nav.deep.x"),
          Object.keys(i18n.getMessages("en")).sort(),
        ];
      },
      { value: ["Home", "X", ["nav.deep.x", "nav.home"]] },
    );
  });

  it("nested addMessages flattens", async () => {
    await parity(
      (make) => {
        const i18n = make();
        i18n.addMessages({ en: { a: { b: "AB" } } });
        return [i18n.t("a.b"), Object.keys(i18n.getMessages("en")).sort()];
      },
      { value: ["AB", ["a.b"]] },
    );
  });

  it("flattenCatalog matches host flattening", async () => {
    await parity(
      (make) => {
        const i18n = make();
        i18n.addMessages({ en: flattenCatalog({ deep: { leaf: "L" } }) });
        return [i18n.t("deep.leaf"), Object.keys(i18n.getMessages("en"))];
      },
      { value: ["L", ["deep.leaf"]] },
    );
  });

  it("clear + add + namespaceLoaded events", async () => {
    await parity(
      (make) => {
        const seen: string[] = [];
        const i18n = make({ messages: { en: { a: "A" } } });
        i18n.on("namespaceLoaded", (d) => seen.push(`${d!.locale}:${d!.namespace}`));
        i18n.addMessages({ en: { b: "B" } });
        const before = [i18n.t("a"), i18n.t("b")];
        i18n.clearMessages("en");
        return [before, i18n.t("a"), seen];
      },
      { value: [["A", "B"], "a", ["en:default"]] },
    );
  });
});

describe("composite parity — loader capability", () => {
  it("registerLoader(fn) then init", async () => {
    await parity(
      async (make) => {
        const i18n = make();
        i18n.registerLoader(async (locale, ns) => ({ hi: `hi-${locale}-${ns}` }));
        await i18n.init();
        return i18n.t("hi");
      },
      { value: "hi-en-default" },
    );
  });

  it("an import map loads on a locale switch, each host reached its documented way", async () => {
    await parity(
      async (make) => {
        const map: LoaderImportMap = {
          en: () => Promise.resolve({ default: { k: "EN" } }),
          de: () => Promise.resolve({ default: { k: "DE" } }),
        };
        // Each maker reaches the adapter its own documented way: the composite
        // through the `registerLoader(importMap)` overload it keeps on its
        // prototype, the recomposed host through the configured `loader(map)`.
        const i18n = make({ importMap: map });
        await i18n.init();
        const before = i18n.t("k");
        await i18n.setLocale("de");
        return [before, i18n.t("k")];
      },
      { value: ["EN", "DE"] },
    );
  });

  it("createImportMapLoader is host-agnostic", async () => {
    await parity(
      async (make) => {
        const i18n = make();
        i18n.registerLoader(
          createImportMapLoader({ en: () => Promise.resolve({ default: { k: "EN" } }) }, () =>
            i18n.getDefaultNamespace(),
          ),
        );
        await i18n.init();
        return i18n.t("k");
      },
      { value: "EN" },
    );
  });

  it("registerLoader rejects a non-function with the SAME error on either host", async () => {
    await parity(
      (make) => {
        const i18n = make();
        i18n.registerLoader(123 as unknown as LoaderFn);
        return "did not throw";
      },
      {
        threw:
          "[i18n] registerLoader(): argument must be a loader function. For a static import map use .use(loader(map)), or wrap it with createImportMapLoader(map, () => i18n.getDefaultNamespace()) — both from @comvi/core/loader.",
      },
    );
  });

  it("attachLoader stays idempotent on either host", async () => {
    await parity(
      (make) => {
        const i18n = make();
        const before = Object.keys(i18n).sort().join();
        const same = i18n.use(attachLoader) === i18n;
        return [same, Object.keys(i18n).sort().join() === before];
      },
      { value: [true, true] },
    );
  });
});

describe("composite parity — plugin host and discovery", () => {
  it("plugin init order + LIFO cleanup on destroy", async () => {
    await parity(
      async (make) => {
        const log: string[] = [];
        const i18n = make();
        i18n.registerPlugin((host) => {
          log.push("init-a");
          host.registerLoader(async () => ({ pk: "from-plugin" }));
          return () => void log.push("cleanup-a");
        });
        i18n.registerPlugin(() => {
          log.push("init-b");
          return () => void log.push("cleanup-b");
        });
        await i18n.init();
        const translated = i18n.t("pk");
        await i18n.destroy();
        return [log, translated];
      },
      { value: [["init-a", "init-b", "cleanup-b", "cleanup-a"], "from-plugin"] },
    );
  });

  it("discovery announce + identity removal on destroy", async () => {
    await parity(
      async (make) => {
        const i18n = make({ instanceId: "parity-host" });
        const queued = (win.__COMVI__ as Array<{ i: { instanceId?: string } }>).map(
          (entry) => entry.i.instanceId,
        );
        const idAfterCtor = i18n.instanceId;
        await i18n.destroy();
        const left = (win.__COMVI__ as unknown[]).length;
        return [queued, idAfterCtor, left];
      },
      { value: [["parity-host"], "parity-host", 0] },
    );
  });

  it("exposeGlobal:false suppresses discovery", async () => {
    await parity(
      (make) => {
        const i18n = make({ instanceId: "quiet", exposeGlobal: false });
        const global = win.__COMVI__;
        return [global === undefined, i18n.instanceId];
      },
      { value: [true, undefined] },
    );
  });

  it("instanceId holds the same own-property position (LAST public key)", async () => {
    await parity(
      (make) => {
        const i18n = make({ instanceId: "ordered" });
        const keys = Object.keys(i18n);
        const publicKeys = keys.filter((key) => !key.startsWith("_"));
        return [publicKeys, publicKeys[publicKeys.length - 1]];
      },
      {
        value: [
          ["messagesCache", "apiKey", "collectContext", "devMode", "instanceId"],
          "instanceId",
        ],
      },
    );
  });

  it("the public own-property SET is identical", async () => {
    await parity(
      (make) => {
        const i18n = make({ instanceId: "reflect", messages: { en: { a: "A" } } });
        const keys = Object.keys(i18n)
          .filter((key) => !key.startsWith("_"))
          .sort();
        return keys;
      },
      { value: ["apiKey", "collectContext", "devMode", "instanceId", "messagesCache"] },
    );
  });
});
