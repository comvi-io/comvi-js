/**
 * Discovery protocol v2 (queue-hook) — plan Phase 2 acceptance, re-gated in
 * framework-slim tier-3 against BOTH install surfaces.
 *
 * Every EXPOSED instance announces itself on window.__COMVI__ by pushing a
 * {v, i} envelope; consumers may swap the raw queue array for a hook object
 * (push/remove). Mixed-version pages are realistic, so construction must also
 * tolerate the v1 legacy registry (register WITHOUT remove) and arbitrary
 * garbage in the global slot.
 *
 * The whole protocol now lives in the `@comvi/core/devtools` capability. The
 * INTERNAL 0.4 composite — `src/core/full.ts`, what the CDN global ships and
 * `@comvi/next`'s builder mirrors — composes it back in; the converged base
 * root does NOT, so a base instance opts in with `attachDevtools`. The suite
 * below runs the ENTIRE protocol against both surfaces — the parity proof that
 * the extraction relocated the capability instead of reimplementing it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// The COMPOSITE host: since the single-entry convergence `../../src` is the
// BASE host, and the batteries-included 0.4 semantics live on in the internal
// composite `src/core/full.ts` (what the CDN global ships and `@comvi/next`'s
// builder mirrors). Imported directly — never through the tags-registering
// helper — so this file's ambient-extension assertions stay meaningful.
import { I18n } from "../../src/core/full";
import type { ComviQueueEntry } from "../../src";
import { createI18n } from "../../src";
import { attachDevtools } from "../../src/devtools";

const win = window as { __COMVI__?: unknown };

/** The two ways an instance can acquire the discovery capability. */
const SURFACES: Record<string, (instanceId: string) => I18n> = {
  "composed host": (instanceId) => new I18n({ locale: "en", exposeGlobal: true, instanceId }),
  "base + attachDevtools": (instanceId) =>
    attachDevtools(createI18n({ locale: "en" }), { instanceId, exposeGlobal: true }),
};

/** The same two surfaces, opting OUT of exposure. */
const UNEXPOSED: Record<string, () => I18n> = {
  "composed host": () => new I18n({ locale: "en", exposeGlobal: false }),
  "base + attachDevtools": () =>
    attachDevtools(createI18n({ locale: "en" }), { exposeGlobal: false }),
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
      expect(typeof queue[0]!.v).toBe("string");
      expect(queue[0]!.v.length).toBeGreaterThan(0);
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

      await second.destroy();

      const queue = win.__COMVI__ as ComviQueueEntry[];
      expect(queue).toHaveLength(1);
      expect(queue[0]!.i).toBe(first);

      await first.destroy();
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
      // Own push shadowed Array.prototype.push: the carrier array stays empty
      expect(hook.length).toBe(0);

      await i18n.destroy();
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

      await i18n.destroy();
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
      // v1 registry shape: register WITHOUT remove
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

      await i18n.destroy();
      expect(registry.get("gd-legacy")).toBeUndefined();
      expect(win.__COMVI__).toBe(registry);
    });

    it("does not throw against a mocked minimal legacy registry object", () => {
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

      await i18n.destroy();
      expect(win.__COMVI__).toBe(42);
    });

    it("survives a throwing hook without breaking construction", () => {
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
    // No `exposeGlobal: false` here — the DEFAULT is what changed. In a
    // browser (this suite runs on happy-dom) a bare slim instance used to
    // expose itself; the protocol now lives in `@comvi/core/devtools`, so
    // there is nothing in the module graph to do it.
    const i18n = createI18n({ locale: "en" });

    expect(win.__COMVI__).toBeUndefined();
    expect(i18n.instanceId).toBeUndefined();
    expect(Object.keys(i18n)).not.toContain("instanceId");

    // destroy() must stay a no-op for discovery, not throw on the absent hook
    await expect(i18n.destroy()).resolves.toBeUndefined();
    expect(win.__COMVI__).toBeUndefined();
  });
});

describe("attachDevtools install surface", () => {
  beforeEach(() => {
    delete win.__COMVI__;
  });

  afterEach(() => {
    delete win.__COMVI__;
  });

  it("exposes by default in a browser and auto-generates the instanceId", () => {
    const i18n = attachDevtools(createI18n({ locale: "en" }));

    expect(i18n.instanceId).toMatch(/^comvi-\d+$/);
    expect((win.__COMVI__ as ComviQueueEntry[])[0]!.i).toBe(i18n);
  });

  it("installs its hooks as non-enumerable own properties", () => {
    const i18n = attachDevtools(createI18n({ locale: "en" }), { instanceId: "gd-attach-desc" });

    // `_`-prefixed members are mangled in the dist, so the descriptor shape —
    // not the name — is the contract. Enumerability is the one that matters:
    // A11 requires a spread copy to carry data only, never behavior.
    const hooks = Object.getOwnPropertyNames(i18n).filter((k) => k.startsWith("_"));
    for (const name of hooks) {
      const value = (i18n as unknown as Record<string, unknown>)[name];
      if (typeof value !== "function") continue;
      expect(Object.getOwnPropertyDescriptor(i18n, name)!.enumerable, name).toBe(false);
    }
    expect(
      Object.keys({ ...i18n }).filter((k) => typeof ({ ...i18n } as never)[k] === "function"),
    ).toEqual([]);

    // `instanceId` IS public data and IS enumerable, exactly as on root.
    expect(Object.keys(i18n)).toContain("instanceId");
  });

  it("is idempotent — a second attach neither re-exposes nor re-ids", () => {
    const i18n = attachDevtools(createI18n({ locale: "en" }), { instanceId: "gd-attach-once" });

    expect(attachDevtools(i18n, { instanceId: "gd-attach-twice" })).toBe(i18n);
    expect(i18n.instanceId).toBe("gd-attach-once");
    expect(win.__COMVI__ as ComviQueueEntry[]).toHaveLength(1);
  });

  it("removes its entry on destroy, like root", async () => {
    const i18n = attachDevtools(createI18n({ locale: "en" }), { instanceId: "gd-attach-destroy" });

    await i18n.destroy();
    expect(win.__COMVI__).toEqual([]);
  });
});
