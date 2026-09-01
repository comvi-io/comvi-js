/**
 * Composition hardening: three defects about the ORDER a host is composed in,
 * each of which used to fail SILENTLY.
 *
 *  • Composing a capability (or queueing a plugin) AFTER `init()` is a no-op,
 *    because the plugin queue is drained inside `init()` and the initial
 *    namespace load already happened. Nothing warned.
 *  • A plugins-only host hands every plugin an `I18nPluginHost`, whose type
 *    promises the loader API. Calling `registerLoader` on one died with a bare
 *    `TypeError: … is not a function` instead of the actionable
 *    `missingCapability("loader")` every wrapper throws.
 *  • `attachDevtools`'s idempotency probe swallowed an `exposeGlobal` flip, so
 *    the SSR-construct / client-enable shape left the instance unannounced
 *    forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ComviQueueEntry, I18nLoaderApi } from "../../src";
import { createI18n } from "../../src";
import { attachLoader, loader } from "../../src/loader";
import { attachPlugins, plugins } from "../../src/plugins";
import { attachDevtools, devtools } from "../../src/devtools";
import { LOADER_MEMBERS, hasLoaderApi } from "../../src/utils/capability";

/** A base host with a catalog, so `init()` needs no loader to succeed. */
function makeHost() {
  return createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: { hello: "Hello" } },
  });
}

describe("B2 — composing after init() warns instead of silently doing nothing", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns exactly once for `.with(plugins()).use(…)` after init()", async () => {
    const i18n = makeHost();
    await i18n.init();
    warnSpy.mockClear();

    const ran = vi.fn();
    const host = i18n.with(plugins());
    host.use(() => void ran());

    // The defect itself: the plugin is queued and never drained.
    expect(ran).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toContain("before init()");
  });

  it("warns exactly once for `use()` on a host composed before init()", async () => {
    const i18n = makeHost().with(plugins());
    await i18n.init();
    warnSpy.mockClear();

    i18n.use(() => {});
    i18n.use(() => {});

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toContain("before init()");
  });

  it("warns exactly once for `.with(loader())` after init()", async () => {
    const i18n = makeHost();
    await i18n.init();
    warnSpy.mockClear();

    i18n.with(loader());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toContain("before init()");
  });

  it("warns once, not twice, when BOTH capabilities land late", async () => {
    const i18n = makeHost();
    await i18n.init();
    warnSpy.mockClear();

    i18n
      .with(loader())
      .with(plugins())
      .use(() => {});

    // One mistake, one warning: the loader and plugin capabilities share the
    // per-host deduper, and each message names the same rule.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toContain("before init()");
  });

  it("stays silent on the supported order (compose, then init)", async () => {
    const i18n = makeHost().with(loader()).with(plugins());
    const ran = vi.fn();
    i18n.use(() => void ran());
    warnSpy.mockClear();

    await i18n.init();

    expect(ran).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent for a plugin queued BY a plugin during init()", async () => {
    const i18n = makeHost().with(plugins());
    i18n.use((host) => {
      host.use(() => {});
    });
    warnSpy.mockClear();

    await i18n.init();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent when a second `.with(plugins())` lands on a host that has it", async () => {
    const i18n = makeHost().with(plugins());
    await i18n.init();
    warnSpy.mockClear();

    i18n.with(plugins());

    // Nothing was installed, so nothing was lost — the `use()` warning is the
    // one that fires when a plugin is actually queued too late.
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

/**
 * The capability shims are a DEVELOPMENT affordance: `attachPlugins` installs
 * them behind its own `IS_DEV` fold, so production keeps the bare `TypeError`
 * and pays nothing. This suite runs with `__DEV__: true`, so it asserts the dev
 * half; the dist suite asserts the prod half against the mangled build,
 * INCLUDING that `hasLoaderApi` answers the same in both.
 */
describe("B4 — a plugins-only host reports the missing loader capability (dev)", () => {
  it("throws the actionable capability error instead of a bare TypeError", () => {
    const i18n = makeHost().with(plugins());

    expect(() =>
      (i18n as unknown as I18nLoaderApi).registerLoader(async () => ({ hello: "Hi" })),
    ).toThrow(/no loader capability/);
  });

  it("surfaces the same error through the plugin lifecycle", async () => {
    const i18n = makeHost().with(plugins());
    const onError = vi.fn();

    i18n.use(
      (host) => {
        host.registerLoader(async () => ({ hello: "Hi" }));
      },
      { required: false, onError },
    );
    await i18n.init();

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toMatch(/no loader capability/);
  });

  it("shims EVERY member of the loader API, and only those", () => {
    const i18n = makeHost().with(plugins());

    const shimmed = LOADER_MEMBERS.filter((name) =>
      Object.prototype.hasOwnProperty.call(i18n, name),
    );
    expect([...shimmed].sort()).toEqual([...LOADER_MEMBERS].sort());

    for (const name of LOADER_MEMBERS) {
      const descriptor = Object.getOwnPropertyDescriptor(i18n, name);
      expect(descriptor, name).toBeDefined();
      expect(
        {
          writable: descriptor!.writable,
          enumerable: descriptor!.enumerable,
          configurable: descriptor!.configurable,
        },
        name,
      ).toEqual({ writable: true, enumerable: false, configurable: true });
      expect(() => (descriptor!.value as () => void)(), name).toThrow(/no loader capability/);
    }

    // The shims must not leak into enumeration or spread copies.
    expect(Object.keys(i18n)).not.toContain("registerLoader");
    expect(Object.keys({ ...i18n })).not.toContain("registerLoader");
  });

  it("keeps `hasLoaderApi` false — a shim is not the capability", () => {
    const i18n = makeHost().with(plugins());

    // The prod/dev parity gate, dev half. Prod has no shims to reject, so dev
    // MUST reject the ones it installs, or the two builds take different
    // branches on the same host.
    expect(hasLoaderApi(i18n)).toBe(false);
    expect(hasLoaderApi(makeHost().with(plugins()).with(loader()))).toBe(true);
  });

  it("installs no shims when the loader is already composed", () => {
    const i18n = makeHost().with(loader());
    const descriptorsBefore = LOADER_MEMBERS.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(i18n, name),
    ]);
    // Guards the comparison below against an empty member list.
    expect(descriptorsBefore.length).toBe(LOADER_MEMBERS.length);
    expect(descriptorsBefore.filter(([, descriptor]) => descriptor === undefined)).toEqual([]);

    attachPlugins(i18n);

    // attachPlugins adds its OWN members, but must not have replaced a single
    // loader member with a shim.
    expect(
      LOADER_MEMBERS.map((name) => [name, Object.getOwnPropertyDescriptor(i18n, name)]),
    ).toEqual(descriptorsBefore);
    // And what is there is the real implementation, not a throwing stand-in.
    const fn = async () => ({ hello: "Hello" });
    i18n.registerLoader(fn);
    expect(i18n.getLoader()).toBe(fn);
  });

  it("composes to the same own-property set in either order", () => {
    const pluginsFirst = attachLoader(attachPlugins(makeHost()));
    const loaderFirst = attachPlugins(attachLoader(makeHost()));

    expect(Object.getOwnPropertyNames(pluginsFirst).sort()).toEqual(
      Object.getOwnPropertyNames(loaderFirst).sort(),
    );
  });

  it.each([
    ["plugins first", () => attachLoader(attachPlugins(makeHost()))],
    ["loader first", () => attachPlugins(attachLoader(makeHost()))],
  ])("lets attachLoader install cleanly over the shims — %s", async (_label, make) => {
    const host = make();
    const fn = vi.fn(async () => ({ hello: "Hello" }));

    host.registerLoader(fn);
    await host.init();

    expect(host.getLoader()).toBe(fn);
    expect(host.t("hello")).toBe("Hello");
  });

  it.each([
    ["plugins first", true],
    ["loader first", false],
  ])("runs a loader-registering plugin identically — %s", async (_label, pluginsFirst) => {
    // No static catalog: the loaded value must be the only source of `hello`.
    const bare = createI18n({ locale: "en", exposeGlobal: false });
    const i18n = pluginsFirst
      ? bare.with(plugins()).with(loader())
      : bare.with(loader()).with(plugins());

    i18n.use((host) => {
      host.registerLoader(async () => ({ hello: "Loaded" }));
    });
    await i18n.init();

    expect(i18n.t("hello")).toBe("Loaded");
  });
});

describe("B3 — attachDevtools re-runs exposure when a later call flips it on", () => {
  const win = window as { __COMVI__?: unknown };

  beforeEach(() => {
    delete win.__COMVI__;
  });

  afterEach(() => {
    delete win.__COMVI__;
  });

  /** The `__COMVI__` queue as an array, or `[]` when nothing was installed. */
  function queue(): ComviQueueEntry[] {
    return Array.isArray(win.__COMVI__) ? (win.__COMVI__ as ComviQueueEntry[]) : [];
  }

  it("announces on the second call when the first opted out (SSR construct, client enable)", () => {
    const i18n = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: false }));

    expect(i18n.instanceId).toBeUndefined();
    expect(queue()).toHaveLength(0);

    i18n.with(devtools({ exposeGlobal: true, instanceId: "client-app" }));

    expect(i18n.instanceId).toBe("client-app");
    expect(queue().map((entry) => entry.i)).toEqual([i18n]);
  });

  it("stays idempotent once announced: same id, no double push", () => {
    const i18n = createI18n({ locale: "en" }).with(
      devtools({ exposeGlobal: true, instanceId: "app" }),
    );

    i18n.with(devtools({ exposeGlobal: true, instanceId: "other" }));
    i18n.with(devtools({ exposeGlobal: true }));

    expect(i18n.instanceId).toBe("app");
    expect(queue()).toHaveLength(1);
  });

  it("still removes the entry on destroy() after a late enable", async () => {
    const i18n = attachDevtools(createI18n({ locale: "en" }), { exposeGlobal: false });
    attachDevtools(i18n, { exposeGlobal: true, instanceId: "late" });

    expect(queue()).toHaveLength(1);

    await i18n.destroy();

    expect(queue()).toHaveLength(0);
  });

  // The SSR trap: `_initDevtools` assigns the id and then returns at the
  // `window` check BEFORE it writes `_globalEntry`, so probing the queue entry
  // would re-fire on every attach — reassigning the id and burning a counter
  // slot per call. `instanceId` is the receipt instead.
  it("exposes a windowless host exactly once — the auto id survives three attaches", () => {
    vi.stubGlobal("window", undefined);

    const auto = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: true }));
    const firstAutoId = auto.instanceId;
    expect(firstAutoId).toMatch(/^comvi-\d+$/);

    auto.with(devtools({ exposeGlobal: true }));
    auto.with(devtools({ exposeGlobal: true, instanceId: "other" }));

    expect(auto.instanceId).toBe(firstAutoId);
    // The counter moved exactly once for `auto`: the next windowless host takes
    // the very next number, which it could not if the three attaches above had
    // each generated one.
    const next = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: true }));
    expect(Number(next.instanceId!.slice("comvi-".length))).toBe(
      Number(firstAutoId!.slice("comvi-".length)) + 1,
    );
  });

  it("keeps an EXPLICIT windowless id sticky across three attaches", () => {
    vi.stubGlobal("window", undefined);

    const named = createI18n({ locale: "en" }).with(
      devtools({ exposeGlobal: true, instanceId: "app" }),
    );
    named.with(devtools({ exposeGlobal: true, instanceId: "other" }));
    named.with(devtools({ exposeGlobal: true, instanceId: "third" }));

    expect(named.instanceId).toBe("app");
  });

  it("leaves a windowless-exposed host alone once a window exists", () => {
    // Deliberate: a host exposed under SSR has an id, so it is done. The
    // client builds its own host rather than re-attaching the server's.
    vi.stubGlobal("window", undefined);
    const i18n = createI18n({ locale: "en" }).with(
      devtools({ exposeGlobal: true, instanceId: "ssr" }),
    );
    vi.unstubAllGlobals();

    i18n.with(devtools({ exposeGlobal: true, instanceId: "client" }));

    expect(i18n.instanceId).toBe("ssr");
    expect(queue()).toHaveLength(0);
  });

  it("keeps opting out while every call opts out", () => {
    const i18n = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: false }));
    i18n.with(devtools({ exposeGlobal: false }));

    expect(i18n.instanceId).toBeUndefined();
    expect(queue()).toHaveLength(0);
  });
});
