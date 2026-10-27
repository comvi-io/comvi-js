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
    // No exported function of /internal is a marker setter.
    expect(Object.keys(internal).filter((k) => /mark/i.test(k))).toEqual([]);
    expect(win.__COMVI__).toBeUndefined();
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
});
