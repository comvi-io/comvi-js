/**
 * The `window.__COMVI__` discovery handshake (contracts/chrome-extension-proxy.json,
 * "discovery"). Everything here is a matched pair with something outside this
 * package — core's `Array.isArray`-first push probe, an old core's
 * `register`/`instances` registry, and the `COMVI_READY` event the Chrome
 * extension's detector also listens for — so the shapes and the event name are
 * pinned literally, not through the module's own constants.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureComviHook, readComviGlobalStatus, type ComviHookApi } from "../src/comviHook";

/** The hook only ever reads `instanceId`, so a bare object is a full stand-in. */
type FakeI18n = { instanceId?: string };
type QueueSlot = Parameters<ComviHookApi["push"]>[0];

/** Widens a hand-built queue slot (including deliberately malformed ones). */
const slot = (value: unknown): QueueSlot => value as QueueSlot;

const globals = () => window as unknown as { __COMVI__?: unknown };

function fake(instanceId?: string): FakeI18n {
  return instanceId === undefined ? {} : { instanceId };
}

function install(existing?: unknown): ComviHookApi {
  if (existing !== undefined) {
    globals().__COMVI__ = existing;
  }
  const hook = ensureComviHook();
  expect(hook).not.toBeNull();
  return hook as ComviHookApi;
}

function comviReady(detail?: { instanceId?: string }): void {
  window.dispatchEvent(
    detail === undefined ? new Event("COMVI_READY") : new CustomEvent("COMVI_READY", { detail }),
  );
}

afterEach(() => {
  if (typeof window !== "undefined") {
    delete globals().__COMVI__;
  }
});

describe("ensureComviHook() installation", () => {
  it("installs the hook on an empty slot and hands the same object back", () => {
    const hook = install();

    expect(globals().__COMVI__).toBe(hook);
    expect(hook.instances.size).toBe(0);
  });

  it("keeps the array masquerade so core's Array.isArray-first probe routes through the hook's push", () => {
    const hook = install();

    hook.push(slot({ i: fake("alpha") }));

    expect(Array.isArray(globals().__COMVI__)).toBe(true);
    // The OWN push shadowed Array.prototype.push: the entry was tracked, not appended.
    expect((globals().__COMVI__ as unknown[]).length).toBe(0);
    expect([...hook.instances.keys()]).toEqual(["alpha"]);
  });

  it("returns the already-installed hook on a second call, keeping what it tracked", () => {
    const first = install();
    first.push(slot({ i: fake("alpha") }));

    const second = ensureComviHook();

    expect(second).toBe(first);
    expect(second?.instances.size).toBe(1);
  });

  it("refuses to clobber a truthy non-conforming global", () => {
    const squatter = { foo: 1 };

    globals().__COMVI__ = squatter;

    expect(ensureComviHook()).toBeNull();
    expect(globals().__COMVI__).toBe(squatter);
  });

  it("refuses a global that claims the editor-hook brand with a falsy value", () => {
    globals().__COMVI__ = { __comviEditorHook: false };

    expect(ensureComviHook()).toBeNull();
  });

  it("refuses a primitive global", () => {
    globals().__COMVI__ = "someone-elses-value";

    expect(ensureComviHook()).toBeNull();
  });

  it("refuses a global whose register is not callable and that has no instances map", () => {
    globals().__COMVI__ = { register: "not-a-function" };

    expect(ensureComviHook()).toBeNull();
  });

  it("refuses a global whose instances is not a Map", () => {
    globals().__COMVI__ = { instances: [] };

    expect(ensureComviHook()).toBeNull();
  });

  it("returns null off-browser, where there is no window to swap", () => {
    vi.stubGlobal("window", undefined);

    expect(ensureComviHook()).toBeNull();
  });
});

describe("ensureComviHook() draining a v2 queue", () => {
  it("swaps in the hook and drains the {v, i} envelopes already queued", () => {
    const hook = install([
      { v: "1.4.0", i: fake("alpha") },
      { v: "1.4.0", i: fake("beta") },
    ]);

    expect(globals().__COMVI__).toBe(hook);
    expect([...hook.instances.keys()]).toEqual(["alpha", "beta"]);
  });

  it("drains a bare instance an old core left on the queue", () => {
    const hook = install([fake("alpha")]);

    expect([...hook.instances.keys()]).toEqual(["alpha"]);
  });

  it("keeps the first core version it sees when a later envelope disagrees", () => {
    const hook = install();

    hook.push(slot({ v: "1.4.0", i: fake("alpha") }));
    hook.push(slot({ v: "2.0.0", i: fake("beta") }));

    expect(readComviGlobalStatus().comviVersion).toBe("1.4.0");
  });

  it("does not erase a known version when a later envelope carries none", () => {
    const hook = install();

    hook.push(slot({ v: "1.4.0", i: fake("alpha") }));
    hook.push(slot({ i: fake("beta") }));

    expect(readComviGlobalStatus().comviVersion).toBe("1.4.0");
  });

  it("ignores an envelope version that is not a string", () => {
    const hook = install();

    hook.push(slot({ v: 42, i: fake("alpha") }));

    expect(readComviGlobalStatus().comviVersion).toBeNull();
  });

  it.each([
    { label: "null", value: null },
    { label: "a string", value: "not-an-instance" },
  ])("ignores a queue slot that is $label", ({ value }) => {
    const hook = install();

    hook.push(slot(value));

    expect(hook.instances.size).toBe(0);
  });

  it("ignores an envelope whose instance is missing, version and all", () => {
    const hook = install();

    hook.push(slot({ v: "1.4.0", i: null }));

    expect(hook.instances.size).toBe(0);
    expect(readComviGlobalStatus().comviVersion).toBeNull();
  });

  it("gives every instance without an instanceId its own generated id", () => {
    const hook = install();

    hook.push(slot(fake()));
    hook.push(slot(fake()));

    const ids = [...hook.instances.keys()];
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^comvi-anon-\d+$/);
    expect(ids[1]).toMatch(/^comvi-anon-\d+$/);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("reuses the generated id when the same anonymous instance is announced twice", () => {
    const hook = install();
    const anonymous = fake();

    hook.push(slot(anonymous));
    const firstId = [...hook.instances.keys()][0];
    hook.push(slot(anonymous));

    expect([...hook.instances.keys()]).toEqual([firstId]);
  });

  it("keeps a re-announced instance in place, so get() still resolves the first one", () => {
    const hook = install();
    const alpha = fake("alpha");

    hook.push(slot(alpha));
    hook.push(slot(fake("beta")));
    hook.push(slot(alpha));

    expect(hook.get()).toBe(alpha);
    expect(hook.instances.size).toBe(2);
  });
});

describe("ensureComviHook() v1 registry surface", () => {
  it("re-keys an instance under the id an old core registers it with", () => {
    const hook = install();
    const anonymous = fake();

    hook.push(slot(anonymous));
    hook.register("explicit", slot(anonymous) as never);

    expect([...hook.instances.keys()]).toEqual(["explicit"]);
  });

  it("remove() drops the instance from the registry", () => {
    const hook = install();
    const alpha = fake("alpha");
    hook.push(slot(alpha));

    hook.remove(slot(alpha));

    expect(hook.instances.size).toBe(0);
  });

  it("unregister(id) drops the instance registered under that id", () => {
    const hook = install();
    hook.push(slot(fake("alpha")));

    hook.unregister("alpha");

    expect(hook.instances.size).toBe(0);
  });

  it.each([
    { label: "null", value: null },
    { label: "an instance that was never announced", value: { instanceId: "ghost" } },
  ])("remove() ignores $label", ({ value }) => {
    const hook = install();
    hook.push(slot(fake("alpha")));

    hook.remove(slot(value));

    expect([...hook.instances.keys()]).toEqual(["alpha"]);
  });

  it("forgets a removed anonymous instance, so re-announcing it mints a fresh id", () => {
    const hook = install();
    const anonymous = fake();

    hook.push(slot(anonymous));
    const firstId = [...hook.instances.keys()][0];
    hook.remove(slot(anonymous));
    hook.push(slot(anonymous));

    expect([...hook.instances.keys()]).toEqual([expect.not.stringMatching(`^${firstId}$`)]);
  });
});

describe("ensureComviHook() draining a v1 legacy registry", () => {
  it("swaps in the hook and copies the legacy instances and version across", () => {
    const hook = install({
      version: "0.3.0",
      instances: new Map([["primary", fake("primary")]]),
      register: () => undefined,
    });

    expect(globals().__COMVI__).toBe(hook);
    expect([...hook.instances.keys()]).toEqual(["primary"]);
    expect(readComviGlobalStatus().comviVersion).toBe("0.3.0");
  });

  it("ignores a legacy version that is not a string", () => {
    install({ version: 3, instances: new Map([["primary", fake("primary")]]) });

    expect(readComviGlobalStatus().comviVersion).toBeNull();
  });

  it("accepts a register-only legacy registry that has nothing to drain", () => {
    const hook = install({ register: () => undefined });

    expect(hook.instances.size).toBe(0);
  });

  it.each([
    { label: "gone", value: null },
    { label: "not an object", value: "not-an-instance" },
  ])("skips a legacy entry whose instance is $label", ({ value }) => {
    const hook = install({ instances: new Map([["broken", value]]) });

    expect(hook.instances.size).toBe(0);
  });

  it("mirrors an instance that reaches the legacy registry after the swap, on COMVI_READY", () => {
    const legacyInstances = new Map<string, FakeI18n>([["primary", fake("primary")]]);
    const hook = install({ version: "0.3.0", instances: legacyInstances });

    legacyInstances.set("late", fake("late"));
    comviReady({ instanceId: "late" });

    expect([...hook.instances.keys()]).toEqual(["primary", "late"]);
  });

  it("ignores a COMVI_READY that carries no detail", () => {
    const hook = install({ instances: new Map([["primary", fake("primary")]]) });

    comviReady();

    expect([...hook.instances.keys()]).toEqual(["primary"]);
  });

  it("ignores a COMVI_READY naming an id the legacy registry does not hold", () => {
    const hook = install({ instances: new Map([["primary", fake("primary")]]) });

    comviReady({ instanceId: "ghost" });

    expect([...hook.instances.keys()]).toEqual(["primary"]);
  });
});

describe("readComviGlobalStatus()", () => {
  const NOTHING_DETECTED = { comviDetected: false, comviVersion: null, instanceCount: 0 };

  it.each([
    { label: "no global at all", value: undefined },
    { label: "a null global", value: null },
    { label: "a truthy non-conforming global", value: { foo: 1 } },
    { label: "a primitive global", value: "someone-elses-value" },
    { label: "a falsy editor-hook brand", value: { __comviEditorHook: false } },
  ])("reports nothing detected for $label", ({ value }) => {
    if (value !== undefined) {
      globals().__COMVI__ = value;
    }

    expect(readComviGlobalStatus()).toEqual(NOTHING_DETECTED);
  });

  it("reports nothing detected off-browser", () => {
    vi.stubGlobal("window", undefined);

    expect(readComviGlobalStatus()).toEqual(NOTHING_DETECTED);
  });

  it("reports an installed hook's version and instance count", () => {
    const hook = install();
    hook.push(slot({ v: "1.4.0", i: fake("alpha") }));

    expect(readComviGlobalStatus()).toEqual({
      comviDetected: true,
      comviVersion: "1.4.0",
      instanceCount: 1,
    });
  });

  it("reports an installed but empty hook as not detected", () => {
    install();

    expect(readComviGlobalStatus()).toEqual(NOTHING_DETECTED);
  });

  it("reports a raw queue's length and its first envelope's version", () => {
    globals().__COMVI__ = [
      { v: "1.4.0", i: fake("alpha") },
      { v: "1.4.0", i: fake("beta") },
    ];

    expect(readComviGlobalStatus()).toEqual({
      comviDetected: true,
      comviVersion: "1.4.0",
      instanceCount: 2,
    });
  });

  it("reports an empty raw queue as not detected", () => {
    globals().__COMVI__ = [];

    expect(readComviGlobalStatus()).toEqual(NOTHING_DETECTED);
  });

  it.each([
    { label: "carries no instance", value: null },
    { label: "carries something that is not an instance", value: "not-an-instance" },
  ])("reports no version when the queue's first envelope $label", ({ value }) => {
    globals().__COMVI__ = [{ v: "1.4.0", i: value }];

    expect(readComviGlobalStatus()).toEqual({
      comviDetected: true,
      comviVersion: null,
      instanceCount: 1,
    });
  });

  it("reports a legacy registry's version and instance count without installing anything", () => {
    const legacy = { version: "0.3.0", instances: new Map([["primary", fake("primary")]]) };
    globals().__COMVI__ = legacy;

    expect(readComviGlobalStatus()).toEqual({
      comviDetected: true,
      comviVersion: "0.3.0",
      instanceCount: 1,
    });
    expect(globals().__COMVI__).toBe(legacy);
  });

  it("reports a register-only legacy registry as detected with zero instances", () => {
    globals().__COMVI__ = { register: () => undefined };

    expect(readComviGlobalStatus()).toEqual({
      comviDetected: true,
      comviVersion: null,
      instanceCount: 0,
    });
  });

  it("reports no version for a legacy registry whose version is not a string", () => {
    globals().__COMVI__ = { version: 3, instances: new Map([["primary", fake("primary")]]) };

    expect(readComviGlobalStatus()).toEqual({
      comviDetected: true,
      comviVersion: null,
      instanceCount: 1,
    });
  });
});

/**
 * The `__comviEditorHook` marker is page-writable data, and a page that
 * pollutes `Object.prototype` marks every object on the page. Adoption must
 * therefore validate the members it is about to read (the same check core
 * makes before pushing: `push` AND `remove`), and probe `Array.isArray`
 * BEFORE the marker so a polluted prototype cannot turn a legitimate raw
 * queue array into a "hook" whose members do not exist.
 */
describe("ensureComviHook() adoption guards", () => {
  const NOTHING_DETECTED = { comviDetected: false, comviVersion: null, instanceCount: 0 };

  afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).__comviEditorHook;
    delete (Object.prototype as Record<string, unknown>).i;
  });

  /** Pollute Object.prototype the way a legacy shim or a gadget page does. */
  function pollutePrototype(key: string, value: unknown): void {
    Object.defineProperty(Object.prototype, key, { configurable: true, writable: true, value });
  }

  const noop = (): void => undefined;

  it.each<{ label: string; value: unknown }>([
    { label: "carries the marker and nothing else", value: { __comviEditorHook: true } },
    {
      label: "carries the marker with no instances map",
      value: { __comviEditorHook: true, push: noop, remove: noop },
    },
    {
      label: "carries the marker with an instances array",
      value: { __comviEditorHook: true, instances: [], push: noop, remove: noop },
    },
  ])("refuses a global that $label", ({ value }) => {
    globals().__COMVI__ = value;

    expect(() => ensureComviHook()).not.toThrow();
    expect(ensureComviHook()).toBeNull();
    expect(globals().__COMVI__).toBe(value);
    expect(readComviGlobalStatus()).toEqual(NOTHING_DETECTED);
  });

  it("treats a marker-carrying v1 registry with a broken remove as the registry it looks like", () => {
    // Not a conforming hook (remove is not callable), but it still duck-types
    // as a v1 legacy registry, so it reaches the designed legacy drain rather
    // than being read as a hook whose members do not work.
    const legacy = {
      __comviEditorHook: true,
      instances: new Map([["primary", fake("primary")]]),
      push: () => undefined,
      remove: "nope",
    };

    const hook = install(legacy);

    expect(hook).not.toBe(legacy);
    expect([...hook.instances.keys()]).toEqual(["primary"]);
  });

  it("refuses a marker-carrying object with no get to resolve instances with", () => {
    // `standalone.activate()` resolves the instance to edit through `get`, so a
    // global without it is not a hook this package can adopt. It still duck-types
    // as a v1 registry, so it is drained into a fresh hook rather than trusted.
    const forged = {
      __comviEditorHook: true,
      instances: new Map([["primary", fake("primary")]]),
      push: noop,
      remove: noop,
    };

    const hook = install(forged);

    expect(hook).not.toBe(forged);
    expect([...hook.instances.keys()]).toEqual(["primary"]);
  });

  it("refuses a marker-carrying function", () => {
    const forged = Object.assign(() => undefined, { __comviEditorHook: true });
    globals().__COMVI__ = forged;

    expect(ensureComviHook()).toBeNull();
    expect(globals().__COMVI__).toBe(forged);
    expect(readComviGlobalStatus()).toEqual(NOTHING_DETECTED);
  });

  it("still drains a raw queue array when Object.prototype carries the marker", () => {
    pollutePrototype("__comviEditorHook", true);

    const hook = install([{ v: "1.4.0", i: fake("alpha") }]);

    expect(globals().__COMVI__).toBe(hook);
    expect([...hook.instances.keys()]).toEqual(["alpha"]);
    expect(readComviGlobalStatus()).toEqual({
      comviDetected: true,
      comviVersion: "1.4.0",
      instanceCount: 1,
    });
  });

  it("does not read a bare instance as an envelope when Object.prototype carries i", () => {
    const attacker = fake("attacker");
    pollutePrototype("i", attacker);
    const hook = install();

    hook.push(slot(fake("real")));

    expect([...hook.instances.keys()]).toEqual(["real"]);
    expect([...hook.instances.values()]).not.toContain(attacker);
  });
});

/**
 * Two copies of @comvi/core on one page (a CDN global plus a bundled npm copy)
 * both mint `comvi-1`. Neither instance may disappear from discovery because
 * of it, and removing one may never evict the other.
 */
describe("ensureComviHook() colliding instance ids", () => {
  it("keeps both instances discoverable when two cores announce the same id", () => {
    const hook = install();
    const first = fake("comvi-1");
    const second = fake("comvi-1");

    hook.push(slot({ v: "1.4.0", i: first }));
    hook.push(slot({ v: "1.4.0", i: second }));

    expect(hook.instances.size).toBe(2);
    expect(hook.get("comvi-1")).toBe(first);
    expect([...hook.instances.values()]).toContain(second);
  });

  it("leaves the live instance tracked when the one that shared its id is removed", () => {
    const hook = install();
    const first = fake("comvi-1");
    const second = fake("comvi-1");
    hook.push(slot({ v: "1.4.0", i: first }));
    hook.push(slot({ v: "1.4.0", i: second }));

    hook.remove(slot({ v: "1.4.0", i: first }));

    expect([...hook.instances.values()]).toEqual([second]);
  });

  it("unregisters only the instance the colliding id still holds", () => {
    const hook = install();
    const first = fake("comvi-1");
    const second = fake("comvi-1");
    hook.push(slot({ v: "1.4.0", i: first }));
    hook.push(slot({ v: "1.4.0", i: second }));

    hook.unregister("comvi-1");

    expect([...hook.instances.values()]).toEqual([second]);
  });

  it("unregisters the instance that claimed the id, not the one now holding it", () => {
    const hook = install();
    const newCore = fake("comvi-1");
    const oldCore = fake();
    hook.push(slot({ v: "1.4.0", i: newCore }));
    hook.register("comvi-1", slot(oldCore) as never);

    hook.unregister("comvi-1");

    expect([...hook.instances.values()]).toEqual([newCore]);
    expect(hook.get("comvi-1")).toBe(newCore);
  });

  it("suffixes the announced id once, however many instances collide", () => {
    const hook = install();

    hook.push(slot({ v: "1.4.0", i: fake("comvi-1") }));
    hook.push(slot({ v: "1.4.0", i: fake("comvi-1") }));
    hook.push(slot({ v: "1.4.0", i: fake("comvi-1") }));

    const keys = [...hook.instances.keys()];
    expect(keys[0]).toBe("comvi-1");
    expect(keys.slice(1)).toEqual([
      expect.stringMatching(/^comvi-1#\d+$/),
      expect.stringMatching(/^comvi-1#\d+$/),
    ]);
    expect(new Set(keys).size).toBe(3);
  });

  it("answers a deduped instance's announced id once nothing holds the exact key", () => {
    const hook = install();
    const first = fake("comvi-1");
    const second = fake("comvi-1");
    hook.push(slot({ v: "1.4.0", i: first }));
    hook.push(slot({ v: "1.4.0", i: second }));

    hook.remove(slot({ v: "1.4.0", i: first }));

    expect(hook.get("comvi-1")).toBe(second);
  });

  it("refuses to guess when two deduped instances share the announced id", () => {
    const hook = install();
    const first = fake("comvi-1");
    hook.push(slot({ v: "1.4.0", i: first }));
    hook.push(slot({ v: "1.4.0", i: fake("comvi-1") }));
    hook.push(slot({ v: "1.4.0", i: fake("comvi-1") }));

    hook.remove(slot({ v: "1.4.0", i: first }));

    expect(hook.get("comvi-1")).toBeUndefined();
    expect(hook.instances.size).toBe(2);
  });

  /** A held "comvi-1" instance, then an old core registering a second instance under that same id. */
  function registerClashingId() {
    const hook = install();
    const held = fake("comvi-1");
    const late = fake();
    hook.push(slot({ v: "1.4.0", i: held }));
    return { hook, held, late };
  }

  it("old core registers an id another instance holds → both instances are kept, the id still resolves to the holder", () => {
    const { hook, held, late } = registerClashingId();

    hook.register("comvi-1", slot(late) as never);

    expect({ size: hook.instances.size, resolved: hook.get("comvi-1") }).toEqual({
      size: 2,
      resolved: held,
    });
  });

  it("clashing id registered, then the holder is removed → only the late instance remains", () => {
    const { hook, held, late } = registerClashingId();
    hook.register("comvi-1", slot(late) as never);

    hook.remove(slot({ v: "1.4.0", i: held }));

    expect([...hook.instances.values()]).toEqual([late]);
  });
});
