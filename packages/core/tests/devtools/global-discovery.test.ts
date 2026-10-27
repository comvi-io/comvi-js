// @vitest-environment happy-dom
/**
 * Discovery protocol v2, the queue-hook one (ported from 0.7 global-discovery).
 *
 * Every EXPOSED instance announces itself on `window.__COMVI__` by pushing a
 * `{v, i, id}` envelope; a consumer may swap the raw queue array for a hook object
 * (push/remove). Mixed-version pages are realistic, so setup must also tolerate the v1
 * legacy registry (register WITHOUT remove) and arbitrary garbage in the global slot.
 * The protocol lives entirely in the `devtools()` plugin; a bare instance carries none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createI18n } from "../../src";
import { devtools, type ComviQueueEntry, type DevtoolsOptions } from "../../src/devtools";
// The same source vitest.config.ts folds into `__VERSION__`.
import pkg from "../../package.json";

const win = window as { __COMVI__?: unknown };

type DiscoveryInstance = ReturnType<typeof createI18n> & { instanceId?: string };

/** An instance with the devtools plugin. */
const expose = (options?: DevtoolsOptions): DiscoveryInstance =>
  createI18n({ locale: "en", plugins: [devtools(options)] });

const SURFACES: Record<string, (instanceId: string) => DiscoveryInstance> = {
  "devtools plugin": (instanceId) => expose({ instanceId, exposeGlobal: true }),
};

const UNEXPOSED: Record<string, () => DiscoveryInstance> = {
  "devtools plugin": () => expose({ exposeGlobal: false }),
};

describe.each(Object.keys(SURFACES))(
  "global discovery (window.__COMVI__ queue-hook protocol v2) — %s",
  (surface) => {
    const makeExposed = SURFACES[surface]!;

    beforeEach(() => {
      delete win.__COMVI__;
    });

    afterEach(() => {
      delete win.__COMVI__;
    });

    it("pushes a {v, i} envelope onto a fresh queue array on construct", () => {
      const i18n = makeExposed("gd-fresh");

      const queue = win.__COMVI__ as ComviQueueEntry[];
      expect(Array.isArray(queue)).toBe(true);
      expect(queue).toHaveLength(1);
      expect(queue[0]!.i).toBe(i18n);
      expect(queue[0]!.v).toBe(pkg.version);
      expect(i18n.instanceId).toBe("gd-fresh");
    });

    it("appends to an existing queue array instead of replacing it", () => {
      const first = makeExposed("gd-first");
      const initialQueue = win.__COMVI__;
      const second = makeExposed("gd-second");

      expect(win.__COMVI__).toBe(initialQueue);
      const queue = win.__COMVI__ as ComviQueueEntry[];
      expect(queue.map((entry) => entry.i)).toEqual([first, second]);
    });

    it("does not touch the global when exposeGlobal is false", () => {
      const i18n = UNEXPOSED[surface]!();

      expect(win.__COMVI__).toBeUndefined();
      expect(i18n.instanceId).toBeUndefined();
    });

    it("splices its own entry (identity-based) out of the raw array on destroy", async () => {
      const first = makeExposed("gd-keep");
      const second = makeExposed("gd-drop");

      second.destroy();

      const queue = win.__COMVI__ as ComviQueueEntry[];
      expect(queue).toHaveLength(1);
      expect(queue[0]!.i).toBe(first);

      first.destroy();
      expect(win.__COMVI__).toEqual([]);
    });

    it("routes through a swapped-in array-masquerading hook for later instances", async () => {
      const push = vi.fn();
      const remove = vi.fn();
      // The editor's hook: a real array whose OWN push/remove shadow
      // Array.prototype, so the Array.isArray-first probe still hits the hook.
      const hook = Object.assign([] as ComviQueueEntry[], { push, remove });
      win.__COMVI__ = hook;

      const i18n = makeExposed("gd-hooked");

      expect(push).toHaveBeenCalledTimes(1);
      const entry = push.mock.calls[0]![0] as ComviQueueEntry;
      expect(entry.i).toBe(i18n);
      expect(typeof entry.v).toBe("string");
      // Own push shadowed Array.prototype.push, so the carrier array stays empty.
      expect(hook.length).toBe(0);

      i18n.destroy();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith(entry);
    });

    it("delivers the envelope via push to a plain (non-array) hook object", async () => {
      const push = vi.fn();
      const remove = vi.fn();
      win.__COMVI__ = { push, remove };

      const i18n = makeExposed("gd-plain-hook");

      expect(push).toHaveBeenCalledTimes(1);
      const entry = push.mock.calls[0]![0] as ComviQueueEntry;
      expect(entry.i).toBe(i18n);

      i18n.destroy();
      expect(remove).toHaveBeenCalledWith(entry);
    });

    it("never calls register on a dual-protocol hook (push AND register present)", () => {
      const push = vi.fn();
      const remove = vi.fn();
      const register = vi.fn();
      win.__COMVI__ = { push, remove, register };

      const i18n = makeExposed("gd-dual");

      expect(push).toHaveBeenCalledTimes(1);
      const entry = push.mock.calls[0]![0] as ComviQueueEntry;
      expect(entry.i).toBe(i18n);
      expect(typeof entry.v).toBe("string");
      expect(register).not.toHaveBeenCalled();
    });

    it("registers two-arg into a real legacy registry so get(id) resolves, and unregisters on destroy", async () => {
      // v1 registry shape: register WITHOUT remove.
      const instances = new Map<string, unknown>();
      const registry = {
        version: "0.4.0",
        instances,
        register: (id: string, instance: unknown) => {
          instances.set(id, instance);
        },
        unregister: (id: string) => {
          instances.delete(id);
        },
        get: (id?: string) => (id ? instances.get(id) : instances.values().next().value),
      };
      win.__COMVI__ = registry;

      const i18n = makeExposed("gd-legacy");

      expect(win.__COMVI__).toBe(registry);
      expect(registry.get("gd-legacy")).toBe(i18n);

      i18n.destroy();
      expect(registry.get("gd-legacy")).toBeUndefined();
      expect(win.__COMVI__).toBe(registry);
    });

    it("registers (id, instance) into a minimal v1 registry", () => {
      const register = vi.fn();
      win.__COMVI__ = { register };

      const i18n = makeExposed("gd-legacy-min");

      expect(register).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith("gd-legacy-min", i18n);
    });

    it("leaves a garbage global untouched and does not throw (construct + destroy)", async () => {
      win.__COMVI__ = 42;

      const i18n = makeExposed("gd-garbage");

      expect(win.__COMVI__).toBe(42);
      expect(i18n.instanceId).toBe("gd-garbage");

      i18n.destroy();
      expect(win.__COMVI__).toBe(42);
    });

    it("splices the raw queue by identity even when the page extended Array.prototype", async () => {
      // `Array.prototype.remove` is a well-known legacy prototype extension.
      // Consulting `g.remove` before `Array.isArray` would hand our entry
      // OBJECT to a polyfill expecting an index: `splice(<object>, 1)` coerces
      // to 0 and drops SOMEONE ELSE's live entry, and the try/catch cannot see
      // it because the wrong thing succeeded.
      Object.defineProperty(Array.prototype, "remove", {
        configurable: true,
        writable: true,
        value(this: unknown[], index: number) {
          this.splice(index, 1);
        },
      });
      try {
        const first = makeExposed("gd-proto-keep");
        const second = makeExposed("gd-proto-drop");
        const queue = win.__COMVI__ as ComviQueueEntry[];
        expect(queue).toHaveLength(2);

        second.destroy();

        expect(queue).toHaveLength(1);
        expect(queue[0]!.i).toBe(first);
      } finally {
        delete (Array.prototype as unknown as Record<string, unknown>).remove;
      }
    });

    it("survives a throwing hook on both construction and destroy", () => {
      win.__COMVI__ = {
        push: () => {
          throw new Error("hostile hook");
        },
        remove: () => {
          throw new Error("hostile hook");
        },
      };

      const i18n = makeExposed("gd-hostile");

      expect(i18n.instanceId).toBe("gd-hostile");
      expect(() => i18n.destroy()).not.toThrow();
    });
  },
);

describe("discovery is absent from a bare @comvi/core instance", () => {
  beforeEach(() => {
    delete win.__COMVI__;
  });

  afterEach(() => {
    delete win.__COMVI__;
  });

  it("never touches the global and never assigns an instanceId", async () => {
    // No `exposeGlobal: false` here — the DEFAULT is the subject. In a browser
    // (this suite runs on happy-dom) a bare instance carries no discovery code
    // at all, so there is nothing in the module graph to expose it.
    const i18n: DiscoveryInstance = createI18n({ locale: "en" });

    expect(win.__COMVI__).toBeUndefined();
    expect(i18n.instanceId).toBeUndefined();
    expect(Object.keys(i18n)).not.toContain("instanceId");

    // destroy() must stay a no-op for discovery, never throw on the absent hook.
    expect(() => i18n.destroy()).not.toThrow();
    expect(win.__COMVI__).toBeUndefined();
  });
});

describe("the devtools plugin with its defaults", () => {
  beforeEach(() => {
    delete win.__COMVI__;
  });

  afterEach(() => {
    delete win.__COMVI__;
  });

  it("exposes by default in a browser and auto-generates the instanceId", () => {
    const i18n = expose();

    expect(i18n.instanceId).toMatch(/^comvi-\d+$/);
    const entry = (win.__COMVI__ as ComviQueueEntry[])[0]!;
    expect(entry.i).toBe(i18n);
    expect(entry.id).toBe(i18n.instanceId);
  });

  it("adds instanceId as a NON-enumerable property: the instance keeps its 13 own keys", () => {
    const i18n = expose({ instanceId: "gd-desc" });

    expect(Object.getOwnPropertyDescriptor(i18n, "instanceId")!.enumerable).toBe(false);
    expect(Object.keys(i18n)).toEqual(Object.keys(createI18n({ locale: "en" })));
  });

  it("removes its entry on destroy", () => {
    const i18n = expose({ instanceId: "gd-destroy" });

    i18n.destroy();
    expect(win.__COMVI__).toEqual([]);
  });
});

/**
 * Two copies of core on one page: a CDN global plus a bundled npm copy, or a
 * binding pinned to a different patch (`core/duplicateGuard.ts` warns about
 * exactly this). A MODULE-scoped id counter belongs to one copy, so both would
 * name their first instance `comvi-1`, and a consumer keyed on the id — both
 * shipped ones are — would only ever see one of the two. The counter therefore
 * lives in a `Symbol.for` slot on `globalThis`, the same cross-copy channel
 * `duplicateGuard.ts` uses, and is never derived from the page's `__COMVI__`.
 *
 * Loading the module graph twice through `vi.resetModules()` IS that shape:
 * two independent copies of the same source, just as two bundles on a page are.
 */
describe("two independently loaded copies of core on one page", () => {
  const COUNTER_KEY = Symbol.for("comvi.core.instanceCounter");

  interface CoreCopy {
    expose: () => DiscoveryInstance;
  }

  async function loadCore(): Promise<CoreCopy> {
    vi.resetModules();
    const [entry, dt] = await Promise.all([import("../../src"), import("../../src/devtools")]);
    return { expose: () => entry.createI18n({ locale: "en", plugins: [dt.devtools()] }) };
  }

  /**
   * A consumer hook of the shape both shipped consumers install: an
   * array-masquerading carrier keyed on `instanceId`, with identity-safe
   * removal.
   */
  function installConsumerHook(): Map<string, unknown> {
    const instances = new Map<string, unknown>();
    win.__COMVI__ = Object.assign([] as unknown[], {
      __comviEditorHook: true as const,
      instances,
      push(entry: ComviQueueEntry) {
        instances.set(entry.id, entry.i);
      },
      remove(entry: ComviQueueEntry) {
        const id = entry.id;
        if (instances.get(id) === entry.i) instances.delete(id);
      },
    });
    return instances;
  }

  beforeEach(() => {
    delete win.__COMVI__;
    // The counter outlives a module copy by design; reset the shared slot so
    // the minted ids are deterministic inside this suite.
    delete (globalThis as unknown as Record<symbol, unknown>)[COUNTER_KEY];
  });

  afterEach(() => {
    delete win.__COMVI__;
    delete (globalThis as unknown as Record<symbol, unknown>)[COUNTER_KEY];
  });

  it("mints distinct ids for two copies with no consumer on the page at all", async () => {
    const copyA = await loadCore();
    const a = copyA.expose();
    const copyB = await loadCore();
    const b = copyB.expose();

    // The raw queue array carries no id set to consult, so the shared counter
    // is the only thing that can keep these apart.
    expect(a.instanceId).toBe("comvi-1");
    expect(b.instanceId).toBe("comvi-2");
    const queue = win.__COMVI__ as ComviQueueEntry[];
    expect(queue.map((entry) => entry.i)).toEqual([a, b]);
  });

  it("mints distinct ids for two copies announcing into a consumer's hook", async () => {
    const instances = installConsumerHook();

    const copyA = await loadCore();
    const a = copyA.expose();
    const copyB = await loadCore();
    const b = copyB.expose();

    expect(a.instanceId).toBe("comvi-1");
    expect(b.instanceId).toBe("comvi-2");
    expect(instances.size).toBe(2);
    expect(instances.get(a.instanceId!)).toBe(a);
    expect(instances.get(b.instanceId!)).toBe(b);
  });

  it("leaves the other copy's instance discoverable when one is destroyed", async () => {
    const instances = installConsumerHook();
    const copyA = await loadCore();
    const a = copyA.expose();
    const copyB = await loadCore();
    const b = copyB.expose();

    a.destroy();

    expect(instances.size).toBe(1);
    expect(instances.get(b.instanceId!)).toBe(b);
  });

  it("continues the sequence a copy loaded earlier had already reached", async () => {
    const copyA = await loadCore();
    copyA.expose();
    copyA.expose();

    const copyB = await loadCore();
    const b = copyB.expose();

    expect(b.instanceId).toBe("comvi-3");
  });

  it("ignores a counter slot a page filled with something that is not a number", async () => {
    (globalThis as unknown as Record<symbol, unknown>)[COUNTER_KEY] = "not-a-number";

    const copyA = await loadCore();
    const a = copyA.expose();

    expect(a.instanceId).toBe("comvi-1");
  });

  /**
   * Construction must not read the page's hook to mint an id. A `Map` whose
   * own `has` throws is the cheap proof: it would have thrown out of
   * `createI18n()` while the id was being chosen.
   */
  it("mints an id without consulting a hostile instances map on the hook", async () => {
    const instances = new Map<string, unknown>();
    Object.defineProperty(instances, "has", {
      configurable: true,
      value() {
        throw new Error("hostile instances map");
      },
    });
    const pushed: ComviQueueEntry[] = [];
    win.__COMVI__ = Object.assign([] as unknown[], {
      __comviEditorHook: true as const,
      instances,
      push(entry: ComviQueueEntry) {
        pushed.push(entry);
      },
      remove() {},
    });

    const copyA = await loadCore();
    const a = copyA.expose();

    expect(a.instanceId).toBe("comvi-1");
    expect(pushed.map((entry) => entry.i)).toEqual([a]);
  });

  /**
   * The same hazard from the other side: an `instances` map that answers `has`
   * with `true` for every candidate. A minting loop that consulted it would
   * never terminate, so this test can only pass while construction does not
   * ask the page anything.
   */
  it("mints an id when the hook's instances map claims to hold every id", async () => {
    const instances = new Map<string, unknown>();
    Object.defineProperty(instances, "has", { configurable: true, value: () => true });
    win.__COMVI__ = Object.assign([] as unknown[], {
      __comviEditorHook: true as const,
      instances,
      push() {},
      remove() {},
    });

    const copyA = await loadCore();
    const a = copyA.expose();

    expect(a.instanceId).toBe("comvi-1");
  });

  it("mints an id without throwing when reading the global throws", async () => {
    Object.defineProperty(win, "__COMVI__", {
      configurable: true,
      get() {
        throw new Error("hostile global");
      },
    });

    const copyA = await loadCore();
    const a = copyA.expose();

    expect(a.instanceId).toBe("comvi-1");
    delete (win as { __COMVI__?: unknown }).__COMVI__;
  });
});
