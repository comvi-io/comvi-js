/**
 * The editor's side of protocol 2 (`src/adapter.ts`) against REAL core 0.8 instances
 * composed with `devtools()`: which `window.__COMVI__` entries it accepts, what it leaves
 * untouched on an incompatible page (owner D1), how it follows later and destroyed
 * instances, and the editor-internal instance ids of the frames.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { I18n } from "@comvi/core";
import { activate, deactivate, isActive } from "../src/standalone";
import { decodeFrames, FRAME_START } from "../src/marker";
import { getSession } from "../src/Core";
import { cleanupDOM } from "./helpers";
import { hoverLabel, renderText } from "./helpers/editorPage";
import { pageInstance } from "./helpers/session";

const win = window as { __COMVI__?: unknown };
const instances: I18n[] = [];
function make(messages: Record<string, string> = { save: "Save" }): I18n {
  const i18n = pageInstance({ messages: { en: messages } });
  instances.push(i18n);
  return i18n;
}

afterEach(() => {
  if (isActive()) deactivate();
  for (const i18n of instances.splice(0)) i18n.destroy();
  delete win.__COMVI__;
  delete (Object.prototype as Record<string, unknown>).x;
  cleanupDOM();
});

/** The instance id of `i18n`'s current marks (what a new `t()` output carries). */
const instOf = (i18n: I18n, key = "save") => decodeFrames(i18n.t(key))[0]?.inst;

/** Everything an activation could have added to the page, as a comparable snapshot. */
function pageSnapshot() {
  return {
    html: document.documentElement.outerHTML,
    globals: Object.keys(window)
      .filter((k) => /comvi/i.test(k))
      .sort(),
  };
}

describe("an incompatible page (owner D1): a typed failure, nothing done", () => {
  const cases: Array<[string, () => unknown, string]> = [
    ["no queue at all", () => undefined, "no-instance"],
    ["an empty queue", () => [], "no-instance"],
    ["a 0.5–0.7 entry { v, i }", () => [{ v: "0.7.1", i: { t: () => "" } }], "old-protocol"],
    [
      "the v1 registry",
      () => ({ version: "0.4.0", instances: new Map(), register: () => {} }),
      "old-protocol",
    ],
    [
      "the 0.7 editor/extension hook",
      () => Object.assign([], { __comviEditorHook: true }),
      "old-protocol",
    ],
    [
      "a handle of protocol 3",
      () => [{ v: "0.9.0", i: {}, x: { p: 3, kind: "comvi" } }],
      "unknown-protocol",
    ],
    [
      "a handle of another library",
      () => [{ v: "1.0.0", i: {}, x: { p: 2, kind: "i18next" } }],
      "unknown-protocol",
    ],
    ["a handle that is not an object", () => [{ v: "0.8.0", i: {}, x: 2 }], "unknown-protocol"],
  ];

  it.each(cases)("%s → code %s", (_name, global, code) => {
    win.__COMVI__ = global();

    const result = activate({ refreshMessages: false });

    expect(result).toEqual({
      ok: false,
      code,
      message: expect.stringMatching(/^\[@comvi\/editor\] /),
    });
  });

  it.each(cases)(
    "%s → the global, the page and the entries are left exactly as they were",
    (_name, global) => {
      const value = global();
      win.__COMVI__ = value;
      const entries = Array.isArray(value) ? [...value] : [];
      const ownBefore = value && typeof value === "object" ? Reflect.ownKeys(value) : [];
      const before = pageSnapshot();
      const observe = vi.spyOn(MutationObserver.prototype, "observe");
      const listen = vi.spyOn(document, "addEventListener");

      activate({ refreshMessages: false });

      expect({
        same: win.__COMVI__ === value,
        own: value && typeof value === "object" ? Reflect.ownKeys(value) : [],
        entries: Array.isArray(value) ? [...value] : [],
        page: pageSnapshot(),
        observers: observe.mock.calls.length,
        listeners: listen.mock.calls.length,
        active: isActive(),
      }).toEqual({
        same: true,
        own: ownBefore,
        entries,
        page: before,
        observers: 0,
        listeners: 0,
        active: false,
      });
    },
  );

  it("an incompatible handle → nothing on it is called", () => {
    const x = { p: 3, kind: "comvi", mark: vi.fn(), state: vi.fn(), read: vi.fn(), load: vi.fn() };
    const i = { add: vi.fn(), on: vi.fn() };
    win.__COMVI__ = [{ v: "0.9.0", i, x }];

    activate({ refreshMessages: false });

    expect([x.mark, x.state, x.read, x.load, i.add, i.on].map((f) => f.mock.calls.length)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it("an entry whose getters throw → no-instance, nothing thrown into the caller", () => {
    const hostile = Object.defineProperty({}, "x", {
      get() {
        throw new Error("page trap");
      },
    });
    win.__COMVI__ = [hostile];

    expect(activate({ refreshMessages: false })).toMatchObject({ ok: false, code: "no-instance" });
  });

  it("a handle inherited from a polluted Object.prototype is not an own `x` → old-protocol", () => {
    (Object.prototype as Record<string, unknown>).x = { p: 2, kind: "comvi" };
    win.__COMVI__ = [{ v: "0.7.1", i: {} }];

    expect(activate({ refreshMessages: false })).toMatchObject({ ok: false, code: "old-protocol" });
  });

  it("an old entry next to a compatible one → activates on the compatible one only", () => {
    const i18n = make();
    (win.__COMVI__ as unknown[]).unshift({ v: "0.7.1", i: { t: () => "" } });

    const result = activate({ refreshMessages: false });

    expect({ ok: result.ok, inst: instOf(i18n) }).toEqual({ ok: true, inst: "" });
  });

  it("a second activation while one runs → already-active, the first keeps running", () => {
    make();
    activate({ refreshMessages: false });

    expect({ second: activate({ refreshMessages: false }), active: isActive() }).toEqual({
      second: { ok: false, code: "already-active", message: expect.any(String) },
      active: true,
    });
  });
});

describe("following the queue after activation", () => {
  it("a second devtools() on one instance (two entries, same i) → one instance, marked once", () => {
    const i18n = pageInstance({ messages: { en: { save: "Save" } } });
    instances.push(i18n);
    const [entry] = win.__COMVI__ as Array<{ v: string; i: I18n; x: { mark: unknown } }>;
    (win.__COMVI__ as unknown[]).push({ ...entry!, x: entry!.x });

    activate({ refreshMessages: false });

    expect({ instances: getSession()!.list().length, inst: instOf(i18n) }).toEqual({
      instances: 1,
      inst: "",
    });
  });

  it("an instance created after activation joins and is marked", () => {
    make();
    activate({ refreshMessages: false });

    const later = make({ later: "Later" });

    expect(later.t("later").includes(FRAME_START)).toBe(true);
  });

  it("a destroyed instance leaves the session", () => {
    const a = make();
    make();
    activate({ refreshMessages: false });

    a.destroy();

    expect(
      getSession()!
        .list()
        .map((t) => t.i),
    ).not.toContain(a);
  });

  it("the editor's push/splice on the array are removed on deactivate; the array object stays", () => {
    make();
    const queue = win.__COMVI__ as unknown[];

    activate({ refreshMessages: false });
    const during = Object.getOwnPropertyNames(queue).filter((k) => k === "push" || k === "splice");
    deactivate();

    expect({
      during,
      after: Object.getOwnPropertyNames(queue).filter((k) => k === "push" || k === "splice"),
      same: win.__COMVI__ === queue,
    }).toEqual({ during: ["push", "splice"], after: [], same: true });
  });

  it("after deactivate a new instance is not marked", () => {
    make();
    activate({ refreshMessages: false });
    deactivate();

    const later = make({ later: "Later" });

    expect(later.t("later")).toBe("Later");
  });

  it("the editor's push never throws into page code, whatever is pushed", () => {
    make();
    activate({ refreshMessages: false });
    const queue = win.__COMVI__ as unknown[];
    const trap = Object.defineProperty({}, "x", {
      get() {
        throw new Error("trap");
      },
    });

    expect(() => queue.push(trap, null, 7, { x: { p: 2, kind: "comvi" } })).not.toThrow();
  });

  it("marks only through a function, and clears with null on deactivate", () => {
    const i18n = make();
    const [entry] = win.__COMVI__ as Array<{ x: { mark: (fn: unknown) => void } }>;
    const mark = vi.spyOn(entry!.x, "mark");

    activate({ refreshMessages: false });
    deactivate();

    expect(mark.mock.calls.map(([fn]) => (fn === null ? "null" : typeof fn))).toEqual([
      "function",
      "null",
    ]);
    expect(i18n.t("save")).toBe("Save");
  });
});

describe("instance ids (editor-internal)", () => {
  it("one instance → empty id; a second appears → the first is re-marked comvi-1, the second gets comvi-2", () => {
    const a = make();
    activate({ refreshMessages: false });
    const alone = instOf(a);

    const b = make();

    expect({ alone, a: instOf(a), b: instOf(b) }).toEqual({
      alone: "",
      a: "comvi-1",
      b: "comvi-2",
    });
  });

  it("ids are stable: a third instance and another's destroy renumber and re-mark nobody", () => {
    const a = make();
    const b = make();
    activate({ refreshMessages: false });
    const [ea, eb] = (win.__COMVI__ as Array<{ x: { mark: unknown } }>).map((e) => e.x);
    const markA = vi.spyOn(ea as { mark: (f: unknown) => void }, "mark");
    const markB = vi.spyOn(eb as { mark: (f: unknown) => void }, "mark");
    const before = { a: instOf(a), b: instOf(b) };

    const c = make();
    a.destroy();
    const d = make();

    expect({
      before,
      b: instOf(b),
      c: instOf(c),
      d: instOf(d),
      remarked: markA.mock.calls.length + markB.mock.calls.length,
    }).toEqual({
      before: { a: "comvi-1", b: "comvi-2" },
      b: "comvi-2",
      c: "comvi-3",
      d: "comvi-4",
      remarked: 0,
    });
  });

  it("two copies of core on one page (same ns:key) → each frame resolves to its own instance", () => {
    const a = make({ save: "Save A" });
    const b = make({ save: "Save B" });
    activate({ refreshMessages: false });
    const session = getSession()!;

    const resolved = [a, b].map((i18n) => session.resolve(instOf(i18n)!)?.i);

    expect(resolved).toEqual([a, b]);
  });

  it("an empty id while several instances are on the page → not resolvable (never 'the active one')", () => {
    make();
    make();
    activate({ refreshMessages: false });

    expect({ empty: getSession()!.resolve(""), unknown: getSession()!.resolve("comvi-9") }).toEqual(
      {
        empty: undefined,
        unknown: undefined,
      },
    );
  });

  it("text already in the DOM for a live instance keeps resolving after others come and go", async () => {
    const a = make();
    const b = make();
    activate({ refreshMessages: false });
    const paragraph = renderText(b.t("save"));

    const c = make();
    a.destroy();

    expect({
      label: await hoverLabel(paragraph),
      owner: getSession()!.resolve(decodeFrames(paragraph.textContent!)[0]!.inst)?.i,
      c: instOf(c),
    }).toEqual({ label: "save", owner: b, c: "comvi-3" });
  });
});
