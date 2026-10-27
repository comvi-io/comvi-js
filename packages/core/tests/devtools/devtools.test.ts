// @vitest-environment happy-dom
/**
 * `@comvi/core/devtools` after R3-14 H1 / R3-15 (the thin hook): ONE queue entry
 * `{ v, i, x }` on `window.__COMVI__`, spliced out on `destroy()`, and the handle `x` =
 * `{ p: 2, kind: "comvi", read, state, mark, load }`. What moved to the extension and the
 * editor (CSP diagnostics, timeout, cross-copy dedupe, the cache salt, the v1 registry and
 * hook probes, `comvi-<n>` ids) is listed in `.lot1-pending-tests.md` for lot 8.
 *
 * happy-dom settles a `<script src>` synchronously on insertion; `hold()` inserts it with
 * its handlers detached, so a test fires `load` / `error` itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n, type I18n } from "../../src/instance";
import { state } from "../../src/internal";
import { devtools, VERSION, type ComviHandle, type ComviQueueEntry } from "../../src/devtools";
import pkg from "../../package.json";

const win = window as { __COMVI__?: unknown; ComviInContextEditor?: unknown };
const scripts = () => Array.from(document.querySelectorAll("script"));

const make = (plugins = [devtools()]) =>
  createI18n({ locale: "en", messages: { en: { hi: "Hi", name: "Hi {n}" } }, plugins });

const entryOf = (i18n: I18n) => (win.__COMVI__ as ComviQueueEntry[]).find((e) => e.i === i18n)!;
const handle = (i18n: I18n): ComviHandle => entryOf(i18n).x;

/** Inserts scripts for real, minus happy-dom's own synchronous settle. */
const hold = () => {
  const root = document.documentElement;
  const append = root.append.bind(root);
  vi.spyOn(root, "append").mockImplementation((...nodes) => {
    for (const node of nodes) {
      const s = node as HTMLScriptElement;
      const { onload, onerror } = s;
      s.onload = s.onerror = null;
      append(s);
      s.onload = onload;
      s.onerror = onerror;
    }
  });
};

// The default is an `error` plus a logged exception; tests settle scripts themselves.
const settings = (
  window as unknown as { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } } }
).happyDOM.settings;

const reset = () => {
  delete win.__COMVI__;
  delete win.ComviInContextEditor;
  for (const s of scripts()) s.remove();
};

beforeEach(() => {
  reset();
  settings.handleDisabledFileLoadingAsSuccess = true;
  hold();
});
afterEach(() => {
  settings.handleDisabledFileLoadingAsSuccess = false;
  vi.unstubAllGlobals();
  reset();
});

describe("the queue entry (H1)", () => {
  it("pushes { v, i, x } onto a fresh queue array", () => {
    const i18n = make();
    const q = win.__COMVI__ as ComviQueueEntry[];
    expect(Array.isArray(q)).toBe(true);
    expect(q).toHaveLength(1);
    expect(Object.keys(q[0]).sort()).toEqual(["i", "v", "x"]);
    expect(q[0].v).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
    expect(q[0].i).toBe(i18n);
  });

  it("the handle has exactly p, kind, read, state, mark and load; p is 2, kind 'comvi'", () => {
    const x = handle(make());
    expect(Object.keys(x).sort()).toEqual(["kind", "load", "mark", "p", "read", "state"]);
    expect(x.p).toBe(2);
    expect(x.kind).toBe("comvi");
  });

  it("appends to an existing queue (or a consumer's array) instead of replacing it", () => {
    const seen: unknown[] = [];
    const q = Object.assign([] as unknown[], { push: (e: unknown) => seen.push(e) });
    win.__COMVI__ = q;
    const i18n = make();
    expect(win.__COMVI__).toBe(q);
    expect(seen).toHaveLength(1);
    expect((seen[0] as ComviQueueEntry).i).toBe(i18n);
  });

  it("destroy() splices its own entry out and leaves the others", () => {
    const a = make();
    const b = make();
    const other = { v: "0.0.1" };
    (win.__COMVI__ as unknown[]).unshift(other);
    a.destroy();
    expect((win.__COMVI__ as ComviQueueEntry[]).map((e) => e.i)).toEqual([undefined, b]);
    a.destroy();
    expect(win.__COMVI__).toHaveLength(2);
    b.destroy();
    expect(win.__COMVI__).toEqual([other]);
  });

  it("destroy() removes nothing when its entry is gone already", () => {
    const i18n = make();
    const others = [{ v: "1" }, { v: "2" }];
    win.__COMVI__ = [...others];
    i18n.destroy();
    expect(win.__COMVI__).toEqual(others);
  });

  it("a garbage or throwing global breaks neither construction nor destroy", () => {
    win.__COMVI__ = 42;
    expect(() => make().destroy()).not.toThrow();
    expect(win.__COMVI__).toBe(42);
    Object.defineProperty(window, "__COMVI__", {
      configurable: true,
      get() {
        throw new Error("hostile");
      },
    });
    expect(() => make().destroy()).not.toThrow();
  });

  it("without a window (SSR) it does nothing", () => {
    vi.stubGlobal("window", undefined);
    const i18n = make();
    vi.unstubAllGlobals();
    expect(win.__COMVI__).toBeUndefined();
    expect(() => i18n.destroy()).not.toThrow();
  });

  it("a bare instance never touches the global", () => {
    make([]).destroy();
    expect(win.__COMVI__).toBeUndefined();
  });

  it("the instance gets no instanceId and keeps its 13 own keys (R3-14: instanceId removed)", () => {
    const i18n = make();
    expect("instanceId" in i18n).toBe(false);
    expect(Object.getOwnPropertyNames(i18n)).toHaveLength(13);
    expect(JSON.stringify(Object.keys(entryOf(i18n)))).not.toMatch(/instanceId/);
  });

  it("nothing is left on globalThis but the queue (no loader slot, no id counter)", () => {
    const before = Object.getOwnPropertySymbols(globalThis);
    make();
    expect(Object.getOwnPropertySymbols(globalThis)).toEqual(before);
  });
});

describe("x.read and x.state", () => {
  it("read(ns, locale) gives the pair's messages as written, the added ones included", () => {
    const i18n = make();
    i18n.add("en", { hi: "Hello" });
    const x = handle(i18n);
    x.mark((out) => `[${out}]`);
    expect(x.read("default", "en")).toEqual({ hi: "Hello", name: "Hi {n}" });
    expect(x.read("default", "de")).toEqual({});
    expect(x.read("shop", "en")).toEqual({});
  });

  it("state() is the published state", () => {
    const i18n = make();
    const x = handle(i18n);
    expect(x.state()).toBe(state(i18n));
    i18n.add("en", { x: "X" });
    expect(x.state()).toBe(state(i18n));
  });
});

describe("x.load(version?) — the editor on the page (R3-15)", () => {
  const BASE = "https://cdn.jsdelivr.net/npm/@comvi/editor@";

  it.each([
    [undefined, "latest"],
    ["latest", "latest"],
    ["1.2.3", "1.2.3"],
    ["0.8.0-rc.1", "0.8.0-rc.1"],
  ])("version %j → one script for the fixed host and path", (v, as) => {
    void handle(make())
      .load(v)
      .catch(() => {});
    expect(scripts().map((s) => s.src)).toEqual([`${BASE}${as}/dist/standalone.iife.js`]);
  });

  it("resolves with the editor global once the script ran", async () => {
    const p = handle(make()).load("1.2.3");
    const editor = { activate() {} };
    win.ComviInContextEditor = editor;
    scripts()[0].onload!(new Event("load"));
    await expect(p).resolves.toBe(editor);
  });

  it("rejects when the script ran but left no editor", async () => {
    const p = handle(make()).load();
    scripts()[0].onload!(new Event("load"));
    await expect(p).rejects.toThrow(/\[@comvi\/core\/devtools\] no editor/);
  });

  it("rejects when the script fails", async () => {
    const p = handle(make()).load();
    const e = new Event("error");
    scripts()[0].onerror!(e);
    await expect(p).rejects.toBe(e);
  });

  it.each([
    "https://evil.example/x.js",
    "//evil.example/x.js",
    "../../evil",
    "1.2.3/../../x",
    "1.2.3?x=1",
    "1.2.3#x",
    "1.2.3%2F..",
    "1.2",
    "",
    "latest/x",
    " 1.2.3",
  ])("never a URL: %j rejects and creates no script", async (v) => {
    const x = handle(make());
    let threw = false;
    let p: Promise<unknown> | undefined;
    try {
      p = x.load(v);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    await expect(p).rejects.toThrow(TypeError);
    expect(scripts()).toEqual([]);
  });

  it("a value that is not a string is read once, as a string", async () => {
    let reads = 0;
    const sneaky = {
      toString: () => (reads++ ? "https://evil.example/x" : "1.2.3"),
    } as unknown as string;
    void handle(make())
      .load(sneaky)
      .catch(() => {});
    expect(reads).toBe(1);
    expect(scripts()[0].src).toBe(`${BASE}1.2.3/dist/standalone.iife.js`);
  });

  it("a synchronous throw on the src assignment (Trusted Types) rejects, never throws", async () => {
    const real = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = real(tag);
      Object.defineProperty(el, "src", {
        set() {
          throw new TypeError("This document requires 'TrustedScriptURL' assignment.");
        },
      });
      return el;
    });
    const x = handle(make());
    let p: Promise<unknown> | undefined;
    expect(() => (p = x.load("1.2.3"))).not.toThrow();
    await expect(p).rejects.toThrow(/TrustedScriptURL/);
    expect(scripts()).toEqual([]);
  });

  it("no document element rejects, never throws", async () => {
    const x = handle(make());
    vi.spyOn(document, "documentElement", "get").mockReturnValue(null as never);
    let p: Promise<unknown> | undefined;
    expect(() => (p = x.load())).not.toThrow();
    await expect(p).rejects.toThrow();
  });

  it("nothing is cached: a second call loads again", () => {
    const x = handle(make());
    void x.load().catch(() => {});
    void x.load().catch(() => {});
    expect(scripts()).toHaveLength(2);
  });
});
