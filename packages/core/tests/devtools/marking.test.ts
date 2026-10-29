// @vitest-environment happy-dom
/**
 * The marking hook (design R3-14 H3, H4, H9; editor plan §3.1, §3.3, §3.4).
 *
 * - `State.mk` is set ONLY through the `/devtools` handle `x.mark(fn | null)`, which
 *   publishes a new state (bindings re-render on their own);
 * - `translate` calls it for found AND missing keys, with the namespace the key was
 *   looked up in; `{ markers: false }` is checked BEFORE it, so the hook never runs for
 *   such a call (counted, not timed);
 * - `view()` inherits it, so render-local output is marked too;
 * - marking on/off and a save (`add()`) keep the compiled messages of unchanged keys;
 * - an instance without `devtools()` is never marked, and without a session the hook
 *   costs no call.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, type I18n } from "../../src/instance";
import * as internal from "../../src/internal";
import { state, translate, view } from "../../src/internal";
import { devtools, type ComviQueueEntry, type Mark } from "../../src/devtools";

const win = window as { __COMVI__?: ComviQueueEntry[] };
afterEach(() => {
  delete win.__COMVI__;
});

const MSGS = {
  hi: "Hi",
  name: "Hi {n}",
  rich: "Read <b>this</b>",
  count: "{c, plural, one {# item} other {# items}}",
};

const make = (o: Partial<Parameters<typeof createI18n>[0]> = {}) => {
  const i18n = createI18n({
    locale: "en",
    catalogs: { default: { en: MSGS }, shop: { en: { buy: "Buy" } } },
    onError: () => {},
    plugins: [devtools()],
    ...o,
  });
  return { i18n, x: win.__COMVI__!.find((e) => e.i === i18n)!.x };
};

/** A hook that wraps strings in brackets and records what it saw. */
const bracket = () =>
  vi.fn<Mark>((out, key, ns) => (typeof out == "string" ? `[${ns}|${key}|${out}]` : out));

describe("x.mark (H4)", () => {
  it("publishes a new state carrying the hook; subscribers run; t() is marked", () => {
    const { i18n, x } = make();
    const seen: number[] = [];
    i18n.on(() => seen.push(i18n.rev()));
    const before = state(i18n);
    const mk = bracket();
    x.mark(mk);
    expect(seen).toEqual([before.rev + 1]);
    expect(state(i18n)).not.toBe(before);
    expect(state(i18n).mk).toBe(mk);
    // The fast path (default namespace, no options) is marked too.
    expect(i18n.t("hi")).toBe("[default|hi|Hi]");
    expect(i18n.t("name", { n: "Ann" })).toBe("[default|name|Hi Ann]");
    expect(i18n.ns("shop")("buy")).toBe("[shop|buy|Buy]");
    expect(i18n.t("buy", { ns: "shop" })).toBe("[shop|buy|Buy]");
  });

  it("mark(null) publishes again; new output is unmarked, the fast path is back", () => {
    const { i18n, x } = make();
    x.mark(bracket());
    const rev = i18n.rev();
    x.mark(null);
    expect(i18n.rev()).toBe(rev + 1);
    expect(state(i18n).mk).toBeFalsy();
    expect(i18n.t("hi")).toBe("Hi");
    expect(state(i18n).pr).toBeDefined();
  });

  it("marks a missing key too, with the `missing` output and the namespace", () => {
    const mk = bracket();
    const { i18n, x } = make({ missing: (k) => `?${k}` });
    x.mark(mk);
    expect(i18n.t("nope")).toBe("[default|nope|?nope]");
    expect(i18n.t("nope", { ns: "shop" })).toBe("[shop|nope|?nope]");
  });

  it("hands rich output (parts) to the hook", () => {
    const mk = bracket();
    const { i18n, x } = make();
    x.mark(mk);
    const out = i18n.t("rich", { b: (c: unknown) => ({ b: c }) });
    expect(Array.isArray(out)).toBe(true);
    expect(mk).toHaveBeenLastCalledWith(out, "rich", "default");
  });

  it("the hook receives what t() would return, never the call's options", () => {
    const mk = bracket();
    const { i18n, x } = make();
    x.mark(mk);
    i18n.t("count", { c: 2, locale: "en" });
    expect(mk).toHaveBeenCalledTimes(1);
    expect(mk.mock.calls[0]).toEqual(["2 items", "count", "default"]);
  });

  it("view() inherits the hook: render-local output is marked", () => {
    const mk = bracket();
    const { i18n, x } = make();
    x.mark(mk);
    const v = view(i18n, state(i18n), { default: { de: { hi: "Hallo" } } }, "de");
    expect(v.mk).toBe(mk);
    expect(translate(i18n, v, "hi")).toBe("[default|hi|Hallo]");
    // A view with nothing to layer is the state itself.
    expect(view(i18n, state(i18n), {})).toBe(state(i18n));
  });

  it("does nothing visible after destroy()", () => {
    const { i18n, x } = make();
    const sub = vi.fn();
    i18n.on(sub);
    i18n.destroy();
    expect(() => x.mark(bracket())).not.toThrow();
    expect(sub).not.toHaveBeenCalled();
    expect(state(i18n).mk).toBeUndefined();
    expect(i18n.t("hi")).toBe("Hi");
  });

  it("a session active at destroy() marks nothing afterwards; state() keeps the last state", () => {
    const { i18n, x } = make();
    const mk = bracket();
    x.mark(mk);
    expect(i18n.t("hi")).toBe("[default|hi|Hi]");
    const last = x.state().rev;
    i18n.destroy();
    mk.mockClear();
    expect(i18n.t("hi")).toBe("Hi");
    expect(i18n.t("gone")).toBe("gone");
    expect(i18n.ns("shop")("buy")).toBe("Buy");
    expect(translate(i18n, state(i18n), "hi")).toBe("Hi");
    expect(mk).not.toHaveBeenCalled();
    expect(x.state().rev).toBe(last);
  });

  it("an inherited `markers: false` is not an opt-out: only the call's own option counts", () => {
    const { i18n, x } = make();
    x.mark(bracket());
    const p = Object.create({ markers: false, ns: "shop", locale: "de" });
    expect(i18n.t("hi", p)).toBe("[default|hi|Hi]");
  });
});

describe("opt-out (H9)", () => {
  it("{ markers: false } is not marked and the hook is NOT called for it", () => {
    const mk = bracket();
    const { i18n, x } = make();
    x.mark(mk);
    expect(i18n.t("hi", { markers: false })).toBe("Hi");
    expect(i18n.t("name", { n: "A", markers: false })).toBe("Hi A");
    expect(i18n.t("nope", { markers: false })).toBe("nope");
    expect(i18n.ns("shop")("buy", { markers: false })).toBe("Buy");
    expect(mk).not.toHaveBeenCalled();
    // The call without the option is marked.
    expect(i18n.t("hi")).toBe("[default|hi|Hi]");
    expect(mk).toHaveBeenCalledTimes(1);
  });

  it("markers: true or another value marks as usual", () => {
    const { i18n, x } = make();
    x.mark(bracket());
    expect(i18n.t("hi", { markers: true })).toBe("[default|hi|Hi]");
  });

  it("with defaultParams the opt-out still holds", () => {
    const mk = bracket();
    const { i18n, x } = make({ defaultParams: { n: "Z" } });
    x.mark(mk);
    expect(i18n.t("name", { markers: false })).toBe("Hi Z");
    expect(mk).not.toHaveBeenCalled();
  });
});

describe("no session, no devtools", () => {
  it("an instance without devtools() has no hook and nothing in /internal sets one", () => {
    const i18n = createI18n({ locale: "en", messages: { en: MSGS }, plugins: [] });
    expect(state(i18n).mk).toBeUndefined();
    expect(i18n.t("hi")).toBe("Hi");
    expect(i18n.t("nope")).toBe("nope");
    // /internal exports exactly these: none of them sets a hook — the instance seam
    // (`core`) has no setter, which only an installed plugin's `setup` receives. A new
    // export must be added here on purpose.
    expect(Object.keys(internal).sort()).toEqual(
      [
        // A prototype-free object (bindings' params and per-namespace tables); sets nothing.
        "N",
        "activate",
        "canonicalize",
        // Reads the instance's clock (a handed-over serverNow, a live render); sets nothing.
        "clock",
        "coming",
        "compile",
        // The binding seam (`Core`): what a binding renders with, the members the wrappers
        // below reach; no setter of the hook among them.
        "core",
        "defaultOnError",
        "dir",
        "formatNumber",
        "formatValue",
        // Reads the published state (a server render's payload); sets nothing.
        "handover",
        "inherit",
        "intl",
        "loading",
        "lookup",
        "negotiate",
        "parents",
        "pluralRules",
        "recordFor",
        "render",
        "state",
        "translate",
        "view",
      ].sort(),
    );
    // The seam a binding reads holds no setter of the hook (lot 4b: `core` is exported).
    expect(Object.keys(internal.core(i18n)).sort()).toEqual(["a", "ch", "n", "o", "s", "tr", "w"]);
    expect(win.__COMVI__).toBeUndefined();
  });

  it("a plugin other than devtools() gets the instance alone: nothing it is handed marks", () => {
    // R3-14 H4: marking goes through `x.mark()` only, so no marking without devtools().
    const got: unknown[][] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: MSGS },
      plugins: [{ name: "probe", setup: (...a: unknown[]) => void got.push(a) }],
    });
    expect(got).toEqual([[i18n]]);
    expect(Object.keys(internal)).not.toContain("MS");
    expect(i18n.t("hi")).toBe("Hi");
    expect(state(i18n).mk).toBeUndefined();
  });

  it("devtools() without a session marks nothing and calls nothing", () => {
    const { i18n } = make();
    expect(state(i18n).mk).toBeUndefined();
    expect(i18n.t("hi")).toBe("Hi");
    expect(state(i18n).pr).toBeDefined();
  });

  it("the hook is called once per t() under a session, never after mark(null) (counted work)", () => {
    const mk = bracket();
    const { i18n, x } = make();
    x.mark(mk);
    for (let i = 0; i < 100; i++) i18n.t("hi");
    expect(mk).toHaveBeenCalledTimes(100);
    x.mark(null);
    for (let i = 0; i < 100; i++) i18n.t("hi");
    expect(mk).toHaveBeenCalledTimes(100);
  });
});

describe("compiled messages survive (H3)", () => {
  /** The compiled entry of `key` in the default/en slot (base, or patch when patched). */
  const compiled = (i18n: I18n, key: string) => {
    const slot = state(i18n).c.default.en;
    return (slot.pc && key in slot.pc ? slot.pc[key] : slot.c[key]) as unknown;
  };

  it("mark on → save of another key → mark off keeps the compiled message of an unchanged key", () => {
    const { i18n, x } = make();
    i18n.t("name", { n: "A" });
    const fn = compiled(i18n, "name");
    expect(typeof fn).toBe("function");
    x.mark(bracket());
    i18n.t("name", { n: "B" });
    expect(compiled(i18n, "name")).toBe(fn);
    i18n.add("en", { hi: "Hello" });
    expect(compiled(i18n, "name")).toBe(fn);
    x.mark(null);
    expect(compiled(i18n, "name")).toBe(fn);
    expect(state(i18n).c.default.en.m).toBe(MSGS);
  });

  it("a save of a key with its unchanged template keeps its compiled message", () => {
    const { i18n } = make();
    i18n.t("name", { n: "A" });
    const fn = compiled(i18n, "name");
    // What t() renders from now on: the patch's entry (compiled on lookup if it had none).
    const used = () => {
      i18n.t("name", { n: "B" });
      const slot = state(i18n).c.default.en;
      expect(slot.p && "name" in slot.p).toBe(true);
      return slot.pc!.name;
    };
    // Saved with another key that does change: the save writes a patch holding both.
    i18n.add("en", { name: "Hi {n}", hi: "Hello" });
    expect(used()).toBe(fn);
    // Saved again into an existing patch, still unchanged.
    i18n.add("en", { hi: "Hello again" });
    i18n.add("en", { name: "Hi {n}", hi: "Hello once more" });
    expect(used()).toBe(fn);
  });

  it("flattening a patch past FLAT keys keeps the patch's compiled messages", () => {
    const { i18n } = make();
    i18n.add("en", { saved: "Saved {n}" });
    i18n.t("saved", { n: 1 });
    const fn = compiled(i18n, "saved");
    expect(typeof fn).toBe("function");
    const many: Record<string, string> = {};
    for (let i = 0; i < 300; i++) many["k" + i] = "v" + i;
    i18n.add("en", many);
    const slot = state(i18n).c.default.en;
    expect(slot.p).toBeUndefined();
    expect(slot.c.saved).toBe(fn);
  });
});
