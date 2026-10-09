import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageWindow, recordEvents, type PageWindow } from "./harness";

/**
 * `window.__COMVI__` is the published SDK/extension contract, so the hook's
 * surface and the status derived from it are behaviour, not internals. Every
 * entry reaching it was pushed by page code and may be anything at all.
 */
interface DiscoveryHook {
  __comviEditorHook: true;
  version: string | undefined;
  instances: Map<string, unknown>;
  push(entry: unknown): void;
  remove(entry: unknown): void;
  register(id: string, instance: unknown): void;
  unregister(id: string): void;
  get(id?: string): unknown;
}

describe("MAIN-world detector discovery hook", () => {
  let page: PageWindow;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function injectDetector(comviGlobal?: unknown): Promise<void> {
    vi.resetModules();
    page = createPageWindow();
    if (comviGlobal !== undefined) {
      page.__COMVI__ = comviGlobal;
    }
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  function hook(): DiscoveryHook {
    return page.__COMVI__ as DiscoveryHook;
  }

  function status(): Record<string, unknown> {
    let detail: Record<string, unknown> | undefined;
    const listener = ((event: CustomEvent) => {
      detail = event.detail as Record<string, unknown>;
    }) as EventListener;
    page.addEventListener("comvi-extension:status", listener);
    page.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
    page.removeEventListener("comvi-extension:status", listener);
    if (!detail) throw new Error("detector did not answer get-status");
    return detail;
  }

  it("reports no detection while the adopted queue is still empty", async () => {
    await injectDetector([]);

    expect(hook().__comviEditorHook).toBe(true);
    expect(status()).toMatchObject({ detected: false, instanceCount: 0, version: null });
  });

  it("installs a hook that masquerades as an empty queue array", async () => {
    await injectDetector([{ v: "2.0.0", i: { instanceId: "drained" } }]);

    const installed = page.__COMVI__ as unknown[];

    expect(Array.isArray(installed)).toBe(true);
    expect(installed).toHaveLength(0);
  });

  it("keeps the version the first announcement carried", async () => {
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: { instanceId: "first" } });
    hook().push({ v: "3.0.0", i: { instanceId: "second" } });

    expect(status()).toMatchObject({ version: "2.0.0", instanceCount: 2 });
  });

  it("keeps the known version when a later instance announces none", async () => {
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: { instanceId: "first" } });
    hook().push({ i: { instanceId: "second" } });

    expect(status()).toMatchObject({ version: "2.0.0" });
  });

  it("ignores a version that is not a string", async () => {
    await injectDetector([]);

    hook().push({ v: 200, i: { instanceId: "first" } });

    expect(status()).toMatchObject({ version: null, instanceCount: 1 });
  });

  it("answers an id-less lookup with the instance announced first", async () => {
    const first = { instanceId: "first" };
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: first });
    hook().push({ v: "2.0.0", i: { instanceId: "second" } });

    expect(hook().get()).toBe(first);
  });

  it("keeps the first instance primary when it is announced again", async () => {
    const first = { instanceId: "first" };
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: first });
    hook().push({ v: "2.0.0", i: { instanceId: "second" } });
    hook().push({ v: "2.0.0", i: first });

    expect(hook().get()).toBe(first);
    expect(status()).toMatchObject({ instanceCount: 2 });
  });

  it("moves an instance to the new id when the core re-registers it", async () => {
    const instance = {};
    await injectDetector([]);

    hook().register("old-id", instance);
    hook().register("new-id", instance);

    expect(hook().get("old-id")).toBeUndefined();
    expect(hook().get("new-id")).toBe(instance);
    expect(status()).toMatchObject({ instanceCount: 1 });
  });

  it("re-announcing a removed instance registers it under its own id", async () => {
    const instance = { instanceId: "own-id" };
    await injectDetector([]);

    hook().register("popup-id", instance);
    hook().unregister("popup-id");
    hook().push({ v: "2.0.0", i: instance });

    expect(hook().get("own-id")).toBe(instance);
    expect(hook().get("popup-id")).toBeUndefined();
  });

  it("counts an instance without an id once, however often it is announced", async () => {
    const anonymous = {};
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: anonymous });
    hook().push({ v: "2.0.0", i: anonymous });

    expect(status()).toMatchObject({ instanceCount: 1 });
  });

  it("gives two id-less instances separate slots", async () => {
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: {} });
    hook().push({ v: "2.0.0", i: {} });

    expect(status()).toMatchObject({ instanceCount: 2 });
  });

  it.each([
    ["null", null],
    ["a string", "not-an-instance"],
    ["a number", 7],
    ["an envelope with no instance", { v: "2.0.0", i: null }],
    ["an envelope wrapping a string", { v: "2.0.0", i: "nope" }],
  ])("ignores an announcement of %s", async (_label, entry) => {
    await injectDetector([]);

    expect(() => hook().push(entry)).not.toThrow();
    expect(status()).toMatchObject({ detected: false, instanceCount: 0 });
  });

  it.each([
    ["null", null],
    ["a string", "not-an-instance"],
  ])("ignores a removal of %s", async (_label, entry) => {
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: { instanceId: "kept" } });

    expect(() => hook().remove(entry)).not.toThrow();
    expect(status()).toMatchObject({ instanceCount: 1 });
  });

  it.each([
    ["null", null],
    ["a string", "not-an-instance"],
  ])("refuses to register %s as an instance", async (_label, instance) => {
    await injectDetector([]);

    hook().register("forged", instance);

    expect(hook().get("forged")).toBeUndefined();
    expect(status()).toMatchObject({ detected: false, instanceCount: 0 });
  });

  it("ignores removal of an instance it never saw", async () => {
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: { instanceId: "kept" } });

    hook().remove({ v: "2.0.0", i: { instanceId: "ghost" } });
    hook().unregister("ghost");

    expect(status()).toMatchObject({ instanceCount: 1 });
  });

  it("does not mistake a marker-carrying function for the hook", async () => {
    const forged = Object.assign(() => undefined, { __comviEditorHook: true });
    await injectDetector(forged);

    expect(status()).toMatchObject({ detected: true, instanceCount: 0, version: null });
    expect(page.__COMVI__).toBe(forged);
  });

  it("does not mistake a forged marker value for the hook", async () => {
    const forged = { __comviEditorHook: "yes" };
    await injectDetector(forged);

    expect(status()).toMatchObject({ detected: true, instanceCount: 0, version: null });
    expect(page.__COMVI__).toBe(forged);
  });

  it("treats an empty global slot as no Comvi at all", async () => {
    await injectDetector(null);

    expect(status()).toMatchObject({ detected: false, instanceCount: 0 });
    expect(page.__COMVI__).toBeNull();
  });
});

/**
 * The id under which an instance is discoverable is page data: two copies of
 * @comvi/core on one page (a CDN global plus a bundled npm copy) both mint
 * `comvi-1`. Neither instance may disappear from discovery because of it, and
 * destroying one may never evict the other.
 */
describe("MAIN-world detector hook: colliding instance ids", () => {
  let page: PageWindow;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function injectDetector(comviGlobal?: unknown): Promise<void> {
    vi.resetModules();
    page = createPageWindow();
    if (comviGlobal !== undefined) {
      page.__COMVI__ = comviGlobal;
    }
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  function hook(): DiscoveryHook {
    return page.__COMVI__ as DiscoveryHook;
  }

  it("keeps both instances discoverable when two cores announce the same id", async () => {
    const first = { instanceId: "comvi-1" };
    const second = { instanceId: "comvi-1" };
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: first });
    hook().push({ v: "2.0.0", i: second });

    expect(hook().instances.size).toBe(2);
    expect(hook().get("comvi-1")).toBe(first);
    expect([...hook().instances.values()]).toContain(second);
  });

  it("leaves the live instance tracked when the one that shared its id is removed", async () => {
    const first = { instanceId: "comvi-1" };
    const second = { instanceId: "comvi-1" };
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: first });
    hook().push({ v: "2.0.0", i: second });

    hook().remove({ v: "2.0.0", i: first });

    expect(hook().instances.size).toBe(1);
    expect([...hook().instances.values()]).toEqual([second]);
  });

  it("unregisters only the instance the colliding id still holds", async () => {
    const first = { instanceId: "comvi-1" };
    const second = { instanceId: "comvi-1" };
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: first });
    hook().push({ v: "2.0.0", i: second });

    hook().unregister("comvi-1");

    expect(hook().instances.size).toBe(1);
    expect([...hook().instances.values()]).toEqual([second]);
  });

  it("unregisters the instance that claimed the id, not the one now holding it", async () => {
    const newCore = { instanceId: "comvi-1" };
    const oldCore = {};
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: newCore });
    hook().register("comvi-1", oldCore);

    hook().unregister("comvi-1");

    expect([...hook().instances.values()]).toEqual([newCore]);
    expect(hook().get("comvi-1")).toBe(newCore);
  });

  it("suffixes the announced id once, however many instances collide", async () => {
    await injectDetector([]);

    hook().push({ v: "2.0.0", i: { instanceId: "comvi-1" } });
    hook().push({ v: "2.0.0", i: { instanceId: "comvi-1" } });
    hook().push({ v: "2.0.0", i: { instanceId: "comvi-1" } });

    const keys = [...hook().instances.keys()];
    expect(keys[0]).toBe("comvi-1");
    expect(keys.slice(1)).toEqual([
      expect.stringMatching(/^comvi-1#\d+$/),
      expect.stringMatching(/^comvi-1#\d+$/),
    ]);
    expect(new Set(keys).size).toBe(3);
  });

  it("answers a deduped instance's announced id once nothing holds the exact key", async () => {
    const first = { instanceId: "comvi-1" };
    const second = { instanceId: "comvi-1" };
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: first });
    hook().push({ v: "2.0.0", i: second });

    hook().remove({ v: "2.0.0", i: first });

    expect(hook().get("comvi-1")).toBe(second);
  });

  it("refuses to guess when two deduped instances share the announced id", async () => {
    const first = { instanceId: "comvi-1" };
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: first });
    hook().push({ v: "2.0.0", i: { instanceId: "comvi-1" } });
    hook().push({ v: "2.0.0", i: { instanceId: "comvi-1" } });

    hook().remove({ v: "2.0.0", i: first });

    expect(hook().get("comvi-1")).toBeUndefined();
    expect(hook().instances.size).toBe(2);
  });

  it("keeps both instances when a v1 core registers an id another instance holds", async () => {
    const held = { instanceId: "comvi-1" };
    const late = {};
    await injectDetector([]);
    hook().push({ v: "2.0.0", i: held });

    // An old core on the same page claims the id a live instance already has.
    hook().register("comvi-1", late);

    expect(hook().instances.size).toBe(2);
    expect(hook().get("comvi-1")).toBe(held);

    hook().remove({ v: "2.0.0", i: held });

    expect([...hook().instances.values()]).toEqual([late]);
  });
});

/**
 * Adoption guards. `__comviEditorHook` is page-writable data and
 * `Object.prototype` pollution is an ordinary page accident, so neither may
 * crash the detector, get a non-conforming global adopted, or silence
 * discovery: the bridge and the popup must always get an answer.
 */
describe("MAIN-world detector adoption guards", () => {
  let page: PageWindow;

  const POLL_INTERVAL = 100;
  const POLLS_BEFORE_GIVING_UP = 30;

  beforeEach(() => {
    vi.useFakeTimers();
    page = createPageWindow();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (Object.prototype as Record<string, unknown>).__comviEditorHook;
    delete (Object.prototype as Record<string, unknown>).i;
  });

  async function injectDetector(): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  /** Pollute Object.prototype the way a legacy shim or a gadget page does. */
  function pollutePrototype(key: string, value: unknown): void {
    Object.defineProperty(Object.prototype, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  function status(): Record<string, unknown> {
    let detail: Record<string, unknown> | undefined;
    const listener = ((event: CustomEvent) => {
      detail = event.detail as Record<string, unknown>;
    }) as EventListener;
    page.addEventListener("comvi-extension:status", listener);
    page.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
    page.removeEventListener("comvi-extension:status", listener);
    if (!detail) throw new Error("detector did not answer get-status");
    return detail;
  }

  /**
   * The runtime half of the contract's `pageToExtension.marker` /
   * `requiredMembers` (pinned as literals in
   * `src/shared/__tests__/proxy-crossrepo.test.ts`): the other consumer reuses
   * this hook on sight of the marker, so the marker and every member it
   * promises must be present on what we install.
   */
  it("installs a hook carrying the marker and every member the contract requires", async () => {
    page.__COMVI__ = [];
    await injectDetector();

    const installed = page.__COMVI__ as Record<string, unknown>;

    expect(installed.__comviEditorHook).toBe(true);
    expect(typeof installed.push).toBe("function");
    expect(typeof installed.remove).toBe("function");
    expect(typeof installed.get).toBe("function");
    expect(installed.instances).toBeInstanceOf(Map);
  });

  it("does not adopt a marker-carrying object that lacks the hook members", async () => {
    const forged = { __comviEditorHook: true };
    page.__COMVI__ = forged;

    await injectDetector();

    expect(page.__COMVI__).toBe(forged);
    expect(status()).toMatchObject({ detected: true, instanceCount: 0, version: null });
  });

  it("does not adopt a marker-carrying object that carries only push and remove", async () => {
    const forged = { __comviEditorHook: true, push: () => {}, remove: () => {} };
    page.__COMVI__ = forged;

    await injectDetector();

    expect(page.__COMVI__).toBe(forged);
    expect(status()).toMatchObject({ detected: true, instanceCount: 0 });
  });

  it("does not adopt a marker-carrying object with no get to resolve instances with", async () => {
    // `push`, `remove` and an `instances` Map, but the editor runtime resolves
    // the instance to edit through `get` — adopting this would hand it a hook
    // whose one remaining member does not exist.
    const forged = {
      __comviEditorHook: true,
      instances: new Map(),
      push: () => {},
      remove: () => {},
    };
    page.__COMVI__ = forged;
    const detected = recordEvents(page, "comvi-extension:detected");

    await injectDetector();

    expect(page.__COMVI__).toBe(forged);
    // Duck-typed as a v1 registry (it carries an instances Map), which is the
    // designed fallback for a global we will not adopt.
    expect(detected).toEqual([
      {
        detected: true,
        version: null,
        instanceCount: 0,
        editorActive: false,
        editorLoaded: false,
      },
    ]);
  });

  it("does not adopt a marker-carrying function", async () => {
    const forged = Object.assign(() => undefined, { __comviEditorHook: true });
    page.__COMVI__ = forged;

    await injectDetector();

    expect(page.__COMVI__).toBe(forged);
    expect(status()).toMatchObject({ detected: true, instanceCount: 0 });
  });

  it("still answers activation after a marker-carrying object occupied the global", async () => {
    page.__COMVI__ = { __comviEditorHook: true };
    const activated = recordEvents(page, "comvi-extension:activated");
    await injectDetector();

    page.dispatchEvent(new CustomEvent("comvi-extension:activate", { detail: JSON.stringify({}) }));

    expect(activated).toEqual([{ success: false, error: "Editor runtime is not loaded" }]);
  });

  it("adopts a real queue array even when Object.prototype carries the marker", async () => {
    pollutePrototype("__comviEditorHook", true);
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "polluted-page" } }];
    const detected = recordEvents(page, "comvi-extension:detected");

    await injectDetector();

    expect(detected).toEqual([
      {
        detected: true,
        version: "2.0.0",
        instanceCount: 1,
        editorActive: false,
        editorLoaded: false,
      },
    ]);
    expect((page.__COMVI__ as { instances: Map<string, unknown> }).instances.size).toBe(1);
  });

  it("does not read a bare instance as an envelope when Object.prototype carries i", async () => {
    const attacker = { instanceId: "attacker" };
    pollutePrototype("i", attacker);
    page.__COMVI__ = [];
    await injectDetector();

    const hook = page.__COMVI__ as { instances: Map<string, unknown>; push(entry: unknown): void };
    hook.push({ instanceId: "real" });

    expect([...hook.instances.keys()]).toEqual(["real"]);
    expect([...hook.instances.values()]).not.toContain(attacker);
  });

  it("reports not-found instead of going silent when every read of the global throws", async () => {
    Object.defineProperty(page, "__COMVI__", {
      configurable: true,
      get() {
        throw new Error("hostile global");
      },
    });
    const notFound = recordEvents(page, "comvi-extension:not-found");

    await injectDetector();
    vi.advanceTimersByTime(POLLS_BEFORE_GIVING_UP * POLL_INTERVAL);

    expect(notFound).toHaveLength(1);
    expect(notFound[0]).toMatchObject({ detected: false, instanceCount: 0 });
  });

  /** Make the page's addEventListener throw until `heal()` is called. */
  function breakAddEventListener() {
    let hostile = true;
    const realAddEventListener = page.addEventListener.bind(page);
    page.addEventListener = ((type: string, listener: EventListener) => {
      if (hostile) throw new Error("page broke addEventListener");
      realAddEventListener(type, listener);
    }) as PageWindow["addEventListener"];
    return {
      heal() {
        hostile = false;
      },
    };
  }

  it("clears the re-injection guard when installation cannot finish", async () => {
    breakAddEventListener();

    const injection = injectDetector();

    await expect(injection).rejects.toThrow("page broke addEventListener");
    expect(page.__comviExtensionDetectorInstalled).toBe(false);
  });

  it("installs on the next injection after a failed one", async () => {
    const listeners = breakAddEventListener();
    await injectDetector().catch(() => undefined);
    listeners.heal();
    page.__COMVI__ = [{ v: "2.0.0", i: { instanceId: "after-retry" } }];
    const detected = recordEvents(page, "comvi-extension:detected");

    await injectDetector();

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ detected: true, instanceCount: 1 });
  });
});
