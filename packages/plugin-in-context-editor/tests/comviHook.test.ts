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
