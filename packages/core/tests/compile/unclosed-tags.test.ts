/**
 * B12 (owner decisions R9, P2 and P3, 21–22.11.2026): an opening tag that is never closed
 * renders as its own text; a closing tag closes the nearest open tag of its name within its
 * sub-message; the compiled tree is at most 200 levels high. The row-by-row contract is
 * contracts/icu-grammar.json (grammar-contract.test.ts); this file pins what the table
 * does not: the development warning's words, the compiled shape, the depth limit's report,
 * and the scanner's work on hostile input, COUNTED (no clock).
 */
import { describe, expect, it, vi } from "vitest";
import { compile, render } from "../../src/compile/cache";
import { message, SYNTAX, type Scan } from "../../src/compile/scanner";
import { createI18n } from "../../src/instance";
import { sink } from "../helpers";

const HINT =
  "; write `<br/>` instead. It renders nothing without a `br` handler or `components` entry";

describe("a never-closed opening tag", () => {
  it("a<br>b renders as written, reports nothing, and warns once with the `<br/>` hint", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onError = vi.fn();
    const i18n = createI18n({ locale: "en", messages: { en: { k: "a<br>b" } }, onError });

    expect([i18n.t("k"), i18n.t("k")]).toEqual(["a<br>b", "a<br>b"]);
    expect(onError).not.toHaveBeenCalled();
    expect(warn.mock.calls).toEqual([
      [`[@comvi/core] \`<br>\` in "k" is never closed and renders as text${HINT}`],
    ]);
  });

  it("another name gets no hint, and each occurrence warns on its own", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(compile("<b>x <b>y", "msg"), {}, "en");

    expect(warn.mock.calls).toEqual([
      ['[@comvi/core] `<b>` in "msg" is never closed and renders as text'],
      ['[@comvi/core] `<b>` in "msg" is never closed and renders as text'],
    ]);
  });

  it("a message that does not compile warns about no tag: its syntax error is the report", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = sink();

    expect(render(compile("<b><i>x</b></i>", "k"), {}, "en", env)).toBe("k");
    expect(env.errors).toEqual([
      { code: "syntax", key: "k", locale: "en", message: "`</i>` closes no open tag" },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("compile('a<br>b') is a render function (the scanner does not merge the token into the text around it)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const compiled = compile("a<br>b", "k");

    expect(typeof compiled).toBe("function");
    expect(render(compiled, undefined, "en")).toBe("a<br>b");
  });
});

describe("never-closed warnings: one per occurrence, no process-wide memory, bounded text", () => {
  const W = '[@comvi/core] `<b>` in "title" is never closed and renders as text';

  it("two locales with the same key and tag warn twice, once each", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const messages = { en: { title: "<b>Note" }, de: { title: "<b>Hinweis" } };

    for (const locale of ["en", "de"]) createI18n({ locale, messages }).t("title");

    expect(warn.mock.calls).toEqual([[W], [W]]);
  });

  it("two instances with their own catalogs warn once each; one shared catalog compiles, and warns, once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const shared = { title: "<b>Note" };

    for (const messages of [{ title: "<b>Note" }, { title: "<b>Note" }])
      createI18n({ locale: "en", messages: { en: messages } }).t("title");
    for (let i = 0; i < 2; i++) createI18n({ locale: "en", messages: { en: shared } }).t("title");

    expect(warn.mock.calls).toEqual([[W], [W], [W]]);
  });

  it("the same message compiled again warns again: nothing outside the compiled entry remembers it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(compile("<b>Note", "title"), {}, "en");
    render(compile("<b>Note", "title"), {}, "en");

    expect(warn.mock.calls).toEqual([[W], [W]]);
  });

  it("warnings come in message order", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(compile("<i>a<b>x</b><u>{n, plural, other {<s>}}", "k"), { n: 1, b: String }, "en");

    expect(warn.mock.calls.map(([m]) => /`<(\w+)>`/.exec(m as string)![1])).toEqual([
      "i",
      "u",
      "s",
    ]);
  });

  it("a long key is shown by its first 60 characters; a message without a key by its first 60", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = "k".repeat(100);

    render(compile("a<b>", key), {}, "en");
    render(compile("x".repeat(100) + "<b>"), {}, "en");

    expect(warn.mock.calls).toEqual([
      [`[@comvi/core] \`<b>\` in "${"k".repeat(60)}…" is never closed and renders as text`],
      [`[@comvi/core] \`<b>\` in "${"x".repeat(60)}…" is never closed and renders as text`],
    ]);
  });

  it.each([
    ["a 2,000-character key", "k".repeat(2_000)],
    ["no key", undefined],
  ])("2,000 never-closed tags under %s: warning text ≤ 50 × the input", (_, key) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const template = "<b>x".repeat(2_000);

    render(compile(template, key), {}, "en");
    const printed = warn.mock.calls.reduce((n, [m]) => n + (m as string).length, 0);

    expect(warn).toHaveBeenCalledTimes(2_000);
    expect(printed).toBeLessThanOrEqual(50 * (template.length + (key?.length ?? 0)));
  });
});

describe("the depth limit: 200 levels of ICU sub-messages and closed tags", () => {
  const deep = (levels: number, wrap: (s: string) => string) => {
    let s = "x";
    for (let i = 0; i < levels; i++) s = wrap(s);
    return s;
  };

  it("10,000 nested plurals render the key and report syntax, not a RangeError", () => {
    const env = sink();

    const out = render(
      compile(
        deep(10_000, (s) => `{n, plural, other {${s}}}`),
        "k",
      ),
      { n: 1 },
      "en",
      env,
    );

    expect(out).toBe("k");
    expect(env.errors).toEqual([
      { code: "syntax", key: "k", locale: "en", message: "nested deeper than 200 levels" },
    ]);
  });

  it("`<b>…<i>y</b>` nested 20,000 times: the tags a closing tag steps over count; syntax, not a RangeError", () => {
    const env = sink();
    const i18n = createI18n({
      locale: "en",
      messages: { en: { k: deep(20_000, (s) => `<b>${s}<i>y</b>`) } },
      onError: (e) => env.r!(e),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const out = i18n.t("k", { b: (c: readonly unknown[]) => c });

    expect([out, env.errors.map((e) => e.code)]).toEqual(["k", ["syntax"]]);
  });

  it("10,000 nested closed tags render the key and report syntax, not a RangeError", () => {
    const env = sink();

    const out = render(
      compile(
        deep(10_000, (s) => `<b>${s}</b>`),
        "k",
      ),
      {},
      "en",
      env,
    );

    expect(out).toBe("k");
    expect(env.errors).toEqual([
      { code: "syntax", key: "k", locale: "en", message: "nested deeper than 200 levels" },
    ]);
  });

  it("a self-closing tag is a closed tag: one level under 200 plurals is one too many", () => {
    const env = sink();

    render(
      compile(deep(200, (s) => `{n, plural, other {${s}}}`).replace("x", "<br/>"), "k"),
      { n: 1 },
      "en",
      env,
    );

    expect(env.errors.map((e) => e.code)).toEqual(["syntax"]);
  });

  it("100,000 never-closed tags are text, whatever their number", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = sink();
    const s = "line<br>".repeat(100_000);

    expect(render(compile(s, "k"), {}, "en", env)).toBe(s);
    expect(env.errors).toEqual([]);
  });
});

describe("work on hostile input, counted", () => {
  /**
   * Scans `s` with a read position that counts its writes and any step back, and a
   * development counter of the stack entries closing tags skip in their search (`Scan.v`).
   */
  const scan = (s: string) => {
    let i = 0;
    let writes = 0;
    let back = 0;
    const P = {
      s,
      k: undefined,
      v: 0,
      get i() {
        return i;
      },
      set i(x: number) {
        writes++;
        if (x < i) back++;
        i = x;
      },
    } as Scan;
    let error = false;
    try {
      message(P, false, false, 0);
    } catch (e) {
      if (e !== SYNTAX) throw e;
      error = true;
    }
    return { length: s.length, writes, back, visits: P.v!, error };
  };

  const N = 5_000;
  const names = (n: number) => Array.from({ length: n }, (_, k) => `<t${k}>`).join("");
  const inPlural = (s: string) => `{n, plural, other {${s}}}`;
  const CASES: [string, string, boolean][] = [
    ["N never-closed tags in a row", "<a>".repeat(N), false],
    ["N never-closed tags with text between", "<a>x".repeat(N), false],
    ["N differently named never-closed tags", names(N), false],
    [
      "N differently named never-closed tags, then the first one's closing tag",
      names(N) + "</t0>",
      false,
    ],
    ["`<b><i>x</b>` N times", "<b><i>x</b>".repeat(N), false],
    ["N never-closed `<i>`, then an unpaired `</b>`", "<i>".repeat(N) + "</b>", true],
    [
      "150 open `<a>`, N never-closed `<i>` above them, then 150 `</a>`",
      "<a>".repeat(150) + "<i>".repeat(N) + "</a>".repeat(150),
      false,
    ],
  ];
  const ALL = [
    ...CASES,
    ...CASES.map(
      ([name, s, error]) => [`${name}, in a plural branch`, inPlural(s), error] as const,
    ),
  ];

  it.each(ALL)(
    "%s: the position only moves forward, writes ≤ 2 × length, stack visits ≤ length",
    (_, s, error) => {
      const work = scan(s);

      expect(work.error).toBe(error);
      expect(work.back).toBe(0);
      expect(work.writes).toBeLessThanOrEqual(2 * work.length);
      expect(work.visits).toBeLessThanOrEqual(work.length);
    },
  );

  it("the counter sees the search: `<b><i>x</b>` N times skips exactly N entries", () => {
    expect(scan("<b><i>x</b>".repeat(N)).visits).toBe(N);
  });
});
