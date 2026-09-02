import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageWindow, type PageWindow } from "./harness";

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
