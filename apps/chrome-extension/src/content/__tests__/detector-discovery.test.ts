import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPageDocument,
  createPageWindow,
  protocol2Entry,
  protocol2Handle,
  recordEvents,
  type PageWindow,
} from "./harness";

/**
 * Protocol 2 discovery (contracts/chrome-extension-proxy.json `discovery`, map D1): the
 * detector reads `window.__COMVI__` as a plain array and drives only an entry with an own
 * `i` object and an own `x` object with `x.p === 2 && x.kind === "comvi"`. Everything else
 * is reported as data and left exactly as it was.
 */
describe("MAIN-world detector protocol 2 discovery", () => {
  let page: PageWindow;

  beforeEach(() => {
    vi.useFakeTimers();
    page = createPageWindow();
    vi.stubGlobal("document", createPageDocument());
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of ["i", "x", "p", "kind", "__comviEditorHook"]) {
      delete (Object.prototype as Record<string, unknown>)[key];
    }
  });

  async function injectDetector(): Promise<void> {
    vi.resetModules();
    vi.stubGlobal("window", page);
    await import("../detector");
  }

  function status(): Record<string, unknown> {
    const reported = recordEvents(page, "comvi-extension:status");
    page.dispatchEvent(new CustomEvent("comvi-extension:get-status"));
    return reported[0] as Record<string, unknown>;
  }

  it("finds a protocol 2 entry and reports its version", async () => {
    page.__COMVI__ = [protocol2Entry(protocol2Handle(), undefined, "0.8.0")];
    await injectDetector();

    expect(status()).toMatchObject({
      detected: true,
      support: "compatible",
      version: "0.8.0",
      instanceCount: 1,
    });
  });

  it("counts an instance with a second devtools() once: entries are deduped by i", async () => {
    const i = { add: vi.fn() };
    page.__COMVI__ = [protocol2Entry(protocol2Handle(), i), protocol2Entry(protocol2Handle(), i)];
    await injectDetector();

    expect(status()).toMatchObject({ support: "compatible", instanceCount: 1 });
  });

  it("counts the instances of two copies of core separately", async () => {
    page.__COMVI__ = [protocol2Entry(), protocol2Entry(protocol2Handle(), undefined, "0.8.1")];
    await injectDetector();

    expect(status()).toMatchObject({ support: "compatible", instanceCount: 2, version: "0.8.0" });
  });

  it.each([
    ["a 0.5–0.7 { v, i } entry", () => [{ v: "0.7.1", i: { instanceId: "comvi-1" } }]],
    [
      "the v1 registry object",
      () => ({ version: "0.4.0", instances: new Map([["comvi-1", {}]]), register() {} }),
    ],
    [
      "the 0.7 hook array",
      () => Object.assign([{ v: "0.7.1", i: {} }], { __comviEditorHook: true, get() {} }),
    ],
  ])("reports %s as an older protocol", async (_label, global) => {
    page.__COMVI__ = global();
    await injectDetector();

    expect(status()).toMatchObject({ detected: true, support: "old-protocol", instanceCount: 0 });
  });

  it("shows the version an old entry carries", async () => {
    page.__COMVI__ = [{ v: "0.7.1", i: {} }];
    await injectDetector();

    expect(status()).toMatchObject({ version: "0.7.1" });
  });

  it.each([
    ["a newer handle protocol", { p: 3 }],
    ["an older handle protocol", { p: 1 }],
    ["a protocol written as text", { p: "2" }],
    ["another library's kind", { kind: "other-i18n" }],
    ["a missing kind", { kind: undefined }],
  ])("reports %s as an unknown protocol", async (_label, override) => {
    page.__COMVI__ = [protocol2Entry(protocol2Handle(override))];
    await injectDetector();

    expect(status()).toMatchObject({
      detected: true,
      support: "unknown-protocol",
      instanceCount: 0,
    });
  });

  it.each([
    ["an x that is not an object", { v: "0.8.0", i: {}, x: 2 }],
    ["a protocol 2 x without an i", { v: "0.8.0", x: protocol2Handle() }],
    [
      "a protocol 2 x with an i that is not an object",
      { v: "0.8.0", i: "i18n", x: protocol2Handle() },
    ],
  ])("reports an entry with %s as an unknown protocol", async (_label, entry) => {
    page.__COMVI__ = [entry];
    await injectDetector();

    expect(status()).toMatchObject({ support: "unknown-protocol", instanceCount: 0 });
  });

  it("lets an unknown protocol win over an old one", async () => {
    page.__COMVI__ = [{ v: "0.7.1", i: {} }, protocol2Entry(protocol2Handle({ p: 3 }))];
    await injectDetector();

    expect(status()).toMatchObject({ support: "unknown-protocol" });
  });

  it("drives the compatible entry on a page that also holds an old and an unknown one", async () => {
    page.__COMVI__ = [
      { v: "0.7.1", i: {} },
      protocol2Entry(protocol2Handle({ kind: "other" })),
      protocol2Entry(),
    ];
    await injectDetector();

    expect(status()).toMatchObject({ support: "compatible", instanceCount: 1 });
  });

  it.each([
    ["no global", undefined],
    ["an empty queue", []],
    ["a string", "comvi"],
    ["a number", 7],
    ["a function", () => undefined],
    ["an array of non-objects", [1, "two", null]],
    ["an array of bare objects", [{}, { v: "0.8.0" }]],
  ])("reports %s as nothing detected", async (_label, global) => {
    page.__COMVI__ = global;
    await injectDetector();

    expect(status()).toMatchObject({ detected: false, support: null, instanceCount: 0 });
  });

  // --- page-controlled data: own data properties only, never a getter ---

  it("runs no getter of an entry or a handle", async () => {
    const getter = vi.fn(() => 2);
    const x = Object.defineProperty(protocol2Handle(), "p", { get: getter });
    const entry = Object.defineProperty({ v: "0.8.0", x }, "i", { get: getter });
    page.__COMVI__ = [entry];
    await injectDetector();

    status();

    expect(getter).not.toHaveBeenCalled();
  });

  it("does not read a handle through a polluted Object.prototype", async () => {
    Object.assign(Object.prototype, { i: {}, x: protocol2Handle(), p: 2, kind: "comvi" });
    page.__COMVI__ = [{ v: "0.8.0" }, { v: "0.8.0", i: {}, x: {} }];
    await injectDetector();

    expect(status()).toMatchObject({ support: "unknown-protocol", instanceCount: 0 });
  });

  it("reads a real queue as one even when Object.prototype carries the 0.7 marker", async () => {
    (Object.prototype as Record<string, unknown>).__comviEditorHook = true;
    page.__COMVI__ = [protocol2Entry()];
    await injectDetector();

    expect(status()).toMatchObject({ support: "compatible" });
  });

  it("reports nothing, and throws nothing, when every read of the global throws", async () => {
    const hostile = new Proxy([], {
      get() {
        throw new Error("hostile");
      },
      getOwnPropertyDescriptor() {
        throw new Error("hostile");
      },
      has() {
        throw new Error("hostile");
      },
    });
    page.__COMVI__ = hostile;
    const notFound = recordEvents(page, "comvi-extension:not-found");
    await injectDetector();

    expect(status()).toMatchObject({ detected: false });
    vi.advanceTimersByTime(3_000);
    expect(notFound).toHaveLength(1);
  });

  it("skips an entry whose reads throw and still finds the next one", async () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("hostile");
        },
      },
    );
    page.__COMVI__ = [hostile, protocol2Entry()];
    await injectDetector();

    expect(status()).toMatchObject({ support: "compatible", instanceCount: 1 });
  });

  it("reads a frozen queue", async () => {
    page.__COMVI__ = Object.freeze([protocol2Entry()]);
    await injectDetector();

    expect(status()).toMatchObject({ support: "compatible" });
  });

  // --- a status read only reads ---

  it("leaves the queue exactly as it found it: the same array, the same entries, no member", async () => {
    const entries = [protocol2Entry(), { v: "0.7.1", i: {} }];
    const queue = [...entries];
    page.__COMVI__ = queue;
    const ownBefore = Object.getOwnPropertyNames(queue);
    await injectDetector();

    status();
    vi.advanceTimersByTime(3_000);

    expect(page.__COMVI__).toBe(queue);
    expect(queue).toEqual(entries);
    expect(queue.every((entry, k) => entry === entries[k])).toBe(true);
    expect(Object.getOwnPropertyNames(queue)).toEqual(ownBefore);
    expect(Object.prototype.hasOwnProperty.call(queue, "push")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(queue, "splice")).toBe(false);
  });

  it("never replaces an absent global", async () => {
    await injectDetector();

    status();
    vi.advanceTimersByTime(3_000);

    expect("__COMVI__" in page).toBe(false);
  });
});
