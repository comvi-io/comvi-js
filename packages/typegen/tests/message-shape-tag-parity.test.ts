/**
 * THE PARITY GUARD for `scanMessageShape`'s tags.
 *
 * `tags` claims which tags core renders as tags and `unbalancedTags` which tag
 * markup it leaves as text. Nothing here is a hand-written expectation: each
 * message is rendered by `@comvi/core` with `icuCompiler` and the tag
 * extension registered (`@comvi/core/tags`), every candidate tag name gets a
 * handler, and the handlers that fire across a spread of parameter values are
 * compared with the scan:
 *
 * - every fired handler is in `tags`;
 * - every name in `tags` fires, when every branch of the message is reachable
 *   (each plural selector is a category or an explicit value);
 * - every name in `unbalancedTags` shows up as literal `<name` or `</name` in
 *   some rendering;
 * - and, in a message with no quoting, escapes or entities to make markup
 *   literal some other way, every literal `<name>` or `</name>` in a rendering
 *   (outside a placeholder rendered as its own text) is in `unbalancedTags`.
 *
 * The messages are the forms the review named, the table's tag rows, and a
 * seeded generator's output, so the run is the same every time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n, type TranslationParams } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import "@comvi/core/tags";
import { scanMessageShape, type MessageShape } from "../src/index";

const NAMED = [
  "{n, plural, other {'#<b>x</b>' <i>y</i>}}",
  "{n, plural, other {'#<b>x</b>'}} <i>y</i>",
  "{g, select, a {<b>} other {</b>}}",
  "{<b/>}",
  "<b>l'{name}</b>",
  "<i>dell'{name}</i> e <b>x</b>",
  "<b>'{x </b> y}' l'{name}</b>",
  "<b>{</b>",
  "<b>x { y</b>",
  "<b>\\\\</b>",
  "<b>C:\\</b>",
  "<b></1></b>",
  "<a><b>x</a></b>",
  "<a><i>x</a>",
  "<b>'<i>'</b>",
  "{n, plural, other {'#{'}} <b>x</b>",
  "{a '#<b>}",
  "<b>Hi</b> {name}",
  "Line<br/>break",
  "Line<br />break",
  "<b >x</b >",
  "<i>a</i><b>b</b><i>c</i>",
  "<my-tag_2>x</my-tag_2>",
  "<b><b>x</b></b>",
  "{n, plural, other {<b>#</b>}} {g, select, a {<i>x</i>} other {y}}",
  "<b>open",
  "close</b>",
  "</z></a>",
  "'{<b>}' {name}",
  "'{' <b>x</b>",
  "a \\<b> c",
  "a\\b <i>x</i>",
  "<i>x</i> { <b>y</b>",
  "{name} <b>y</b>",
  "<1>x</1>",
  "x</>",
  "x <b",
  "<b x>y</b x>",
  "<br/ >",
  "<b>x</b/>",
  "<<b>x</b>",
  "<A>x</A> <Z/> <z0>y</z0> <a9/>",
  "'#<b>x</b>",
  "\\{ <b>x</b>",
  "<b>'{</b>'",
  "<b>'{'{</b>'",
  "<b>'{it''s</b>'",
  "{n, plural, =1 {<b/>} =01 {<i/>} =1 {<em/>} other {x}}",
  "{n, selectordinal, =1 {<b/>} =1.0 {<i/>} =1 {<em/>} other {x}}",
  "{n, plural, =1 {<b/>} =01 {<i>} =1 {<em/>} other {x}}",
  "{n, plural, =01 {<b/>} =1 {<i/>} =01 {<em/>} other {x}}",
  "<b>1<>2</b>",
  "<b>a<x/</b>",
  "{g, select, =01 {<b/>} =1 {x} other {y}}",
  "{n, plural, =1 {<b/>} =01 {x} other {y}}",
];

/** mulberry32: a seeded generator, so the fuzzed messages never change. */
function generator(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/**
 * Messages built from the pieces the tag grammar reacts to: tags (nested,
 * crossed, unclosed, self-closing, with spaces), quotes and elision, `\`,
 * braces, and plural/select arguments whose branches hold more of the same.
 * Every argument gets its own name (`n1`, `g2`, …; `v` for placeholders), at
 * most three per message, so every branch is reachable by some combination of
 * values and the combinations stay few. No name collides with a tag name.
 *
 * `noisy` adds lone braces and quoted braces to the text. They make core build
 * arguments the plain ICU scan does not see (a `{` inside a tag is text to the
 * tag but not to the scan), so a noisy message is checked only for what needs
 * no knowledge of its branches.
 */
function fuzzedMessages(count: number, noisy: boolean): string[] {
  const rnd = generator(noisy ? 184 : 179);
  const pick = <T>(list: readonly T[]): T => list[rnd(list.length)];
  const TAGS = ["b", "i", "em", "x1"];
  const TEXT = [
    "a",
    " ",
    "l'",
    "it's",
    "'{",
    "'}",
    "'#",
    "''",
    "\\",
    "\\<",
    "{",
    "}",
    "<",
    ">",
    "/",
    "#",
    "x",
  ].filter((piece) => noisy || !/[{}]/.test(piece));

  function body(depth: number): string {
    let out = "";
    const parts = 1 + rnd(4);
    for (let k = 0; k < parts; k++) {
      const r = rnd(8);
      if (r < 3) out += pick(TEXT);
      else if (r < 5 || depth > 2) out += tag(depth);
      else if (r === 5) out += "{v}";
      else out += argument(depth);
    }
    return out;
  }
  function tag(depth: number): string {
    const name = pick(TAGS);
    const r = rnd(7);
    if (r === 0) return `<${name}/>`;
    if (r === 1) return `<${name} />`;
    if (r === 2) return `<${name}>`;
    if (r === 3) return `</${name}>`;
    const close = rnd(5) === 0 ? pick(TAGS) : name;
    return `<${name}${rnd(4) ? "" : " "}>${body(depth + 1)}</${close}${rnd(4) ? "" : " "}>`;
  }
  let argumentCount = 0;
  function argument(depth: number): string {
    if (argumentCount === 3) return tag(depth);
    argumentCount++;
    if (rnd(2) === 0) {
      // Half the time, explicit values written more than one way and more
      // than once: which body core keeps depends on their order.
      const selectors =
        rnd(2) === 0
          ? ["one", "other", "=0", "few", "two"].filter(() => rnd(2) === 0)
          : Array.from({ length: 2 + rnd(4) }, () =>
              pick(["=1", "=01", "=1.0", "=2", "=02", "one"]),
            );
      if (!selectors.includes("other")) selectors.push("other");
      const type = rnd(3) === 0 ? "selectordinal" : "plural";
      return `{n${argumentCount}, ${type}, ${selectors.map((s) => `${s} {${body(depth + 1)}}`).join(" ")}}`;
    }
    const selectors =
      rnd(2) === 0
        ? ["a", "c", "other"].filter((s) => s === "other" || rnd(2) === 0)
        : [...Array.from({ length: 2 + rnd(3) }, () => pick(["a", "=1", "=01"])), "other"];
    return `{g${argumentCount}, select, ${selectors.map((s) => `${s} {${body(depth + 1)}}`).join(" ")}}`;
  }

  return Array.from({ length: count }, () => {
    argumentCount = 0;
    return body(0);
  });
}

const CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);
/**
 * Welsh has all six categories in both plural types, so one locale reaches any
 * cardinal and ordinal branch together; these counts hit each of them in both.
 */
const LOCALE = "cy";
const COUNTS = [0, 1, 2, 3, 4, 5, 6, 10];

/**
 * The value lists each argument is rendered with, read off the message text
 * rather than the scan: with tag syntax on, core can see an argument the plain
 * ICU scan reads as quoted text, and the other way round.
 */
function valueLists(message: string): Array<[string, Array<string | number>]> {
  const exact = [...message.matchAll(/=(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  const selectors = [...new Set([...message.matchAll(/([\w=]+)\s*\{/g)].map((m) => m[1]))];
  const lists = new Map<string, Array<string | number>>();
  for (const [, name, type] of message.matchAll(
    /\{\s*([A-Za-z]\w*)\s*,\s*(plural|selectordinal|select)\b/g,
  )) {
    lists.set(name, type === "select" ? [...selectors, "", "zzz"] : [...COUNTS, ...exact]);
  }
  for (const [, name] of message.matchAll(/\{\s*([A-Za-z]\w*)\s*\}/g)) {
    // A digit: a value that could read as a tag name would make the
    // rendering's `<{v}>` look like markup core refused.
    if (!lists.has(name)) lists.set(name, ["9"]);
  }
  return [...lists];
}

/** Every combination of values, or the first 1500 of them with `complete: false`. */
function combinations(lists: Array<[string, Array<string | number>]>): {
  all: TranslationParams[];
  complete: boolean;
} {
  let all: TranslationParams[] = [{}];
  for (const [name, values] of lists) {
    all = all.flatMap((params) => values.map((value) => ({ ...params, [name]: value })));
    if (all.length > 1500) return { all: all.slice(0, 1500), complete: false };
  }
  return { all, complete: true };
}

interface Reading {
  rejected: boolean;
  /** Whether every combination of values was rendered. */
  complete: boolean;
  fired: Set<string>;
  outputs: string[];
}

/** What core does with `message` across every value combination. */
function runtimeReading(message: string, names: string[]): Reading {
  const fired = new Set<string>();
  const outputs: string[] = [];
  const { all, complete } = combinations(valueLists(message));
  const handlers = Object.fromEntries(
    names.map((name) => [
      name,
      ({ children }: { children: unknown }) => {
        fired.add(name);
        return `[${name}:${[children].flat(Infinity).join("")}]`;
      },
    ]),
  );

  for (const locale of [LOCALE]) {
    let i18n;
    try {
      i18n = createI18n({
        locale,
        exposeGlobal: false,
        compiler: icuCompiler,
        messages: { [locale]: { message } },
        onError: () => undefined,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "E_ICU_SYNTAX") {
        return { rejected: true, complete, fired, outputs };
      }
      throw error;
    }

    for (const params of all) {
      try {
        const out = i18n.t("message", { ...params, ...handlers });
        outputs.push([out].flat(Infinity).join(""));
      } catch (error) {
        if ((error as { code?: string }).code === "E_ICU_SYNTAX") {
          return { rejected: true, complete, fired, outputs };
        }
        throw error;
      }
    }
  }
  return { rejected: false, complete, fired, outputs };
}

/**
 * Whether the renderings reached every branch: all combinations were rendered,
 * each plural selector is a category or an explicit value, each select
 * selector and argument name is a plain word, and no argument
 * name is used twice (a branch of an inner `{n, …}` inside an outer one is
 * reachable only for the counts the outer branch already took).
 */
function allBranchesReached(message: string, shape: MessageShape, complete: boolean): boolean {
  const selectorsReachable = [
    ...Object.values(shape.plurals),
    ...Object.values(shape.ordinals),
  ].every(
    (selectors) =>
      selectors.every((selector) => CATEGORIES.has(selector) || /^=-?\d/.test(selector)) &&
      // Core tries explicit values first, and in Welsh most categories hold
      // only a count or two, so `=1` beside `one` can leave `one` unreachable:
      // a plural mixing explicit values with categories besides `other` is out.
      !(
        selectors.some((selector) => selector.startsWith("=")) &&
        selectors.some((selector) => CATEGORIES.has(selector) && selector !== "other")
      ),
  );
  const namesUsedOnce = valueLists(message).every(
    ([name]) => message.split(new RegExp(`\\{\\s*${name}\\s*,`)).length <= 2,
  );
  // A select branch is reached only by a value equal to its selector, and the
  // values are read off the message as plain words.
  const selectsReachable = Object.values(shape.selects).every((selectors) =>
    selectors.every((selector) => /^[\w=]*$/.test(selector)),
  );
  // Read off the text too: with tag syntax on, core can parse an argument the
  // plain scan never saw — one with no name, or an empty first selector.
  const namesPlain =
    shape.params.every((param) => /^[A-Za-z]\w*$/.test(param.name)) &&
    !/\{\s*,|,\s*(?:plural|selectordinal|select)\s*,\s*\{/.test(message);
  return complete && selectorsReachable && selectsReachable && namesPlain && namesUsedOnce;
}

/**
 * A rendering without the `{…}` groups in it. Core renders a placeholder whose
 * parameter is missing as its own text, braces included, and with tag syntax
 * on, a placeholder can be named after markup the plain scan reads elsewhere —
 * that text is a name, not markup core refused.
 */
function withoutPlaceholders(output: string): string {
  let previous;
  let current = output;
  do {
    previous = current;
    current = current.replace(/\{[^{}]*\}/g, "");
  } while (current !== previous);
  return current;
}

function divergences(message: string, checkBranches = true): string[] {
  const shape = scanMessageShape(message);
  const names = [
    ...new Set([...message.matchAll(/<\/?([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1])),
  ];
  if (names.some((name) => valueLists(message).some(([param]) => param === name))) return [];

  const runtime = runtimeReading(message, names);
  if (runtime.rejected) return [];

  const problems: string[] = [];
  const tags = new Set(shape.tags);

  // The per-occurrence plural groups merge into exactly the two records, and
  // each names a parameter of type number.
  for (const [ordinal, record] of [
    [false, shape.plurals],
    [true, shape.ordinals],
  ] as const) {
    const merged = Object.create(null) as Record<string, string[]>;
    for (const group of shape.pluralGroups.filter((g) => g.ordinal === ordinal)) {
      const list = (merged[group.name] ??= []);
      for (const selector of group.selectors) if (!list.includes(selector)) list.push(selector);
      if (!shape.params.some((p) => p.name === group.name && p.type === "number")) {
        problems.push(`plural group ${group.name} names no number parameter`);
      }
    }
    if (JSON.stringify({ ...merged }) !== JSON.stringify({ ...record })) {
      problems.push(`pluralGroups do not merge into ${ordinal ? "ordinals" : "plurals"}`);
    }
  }
  const unbalanced = new Set(shape.unbalancedTags);

  for (const name of runtime.fired) {
    if (!tags.has(name)) problems.push(`core called <${name}>, which tags omits`);
  }
  if (checkBranches && allBranchesReached(message, shape, runtime.complete)) {
    for (const name of tags) {
      if (!runtime.fired.has(name)) problems.push(`tags claims <${name}>, which core never called`);
    }
    for (const name of unbalanced) {
      const literal = new RegExp(`</?${name}(?![A-Za-z0-9_-])`);
      if (!runtime.outputs.some((out) => literal.test(out))) {
        problems.push(`unbalancedTags claims <${name}>, which core never left as text`);
      }
    }
  }
  if (!/['\\&]/.test(message)) {
    for (const out of runtime.outputs.map(withoutPlaceholders)) {
      for (const match of out.matchAll(/<\/?([A-Za-z][A-Za-z0-9_-]*)[\0- ]*>/g)) {
        // Markup written in the message, not two texts that meet in the
        // rendering (`{n, plural, other {<a}}>` renders `<a>`).
        if (!unbalanced.has(match[1]) && message.includes(match[0])) {
          problems.push(`core left <${match[1]}> as text, which unbalancedTags omits`);
        }
      }
    }
  }

  return [...new Set(problems)].map(
    (problem) =>
      `${JSON.stringify(message)}: ${problem}` +
      `\n    tags ${JSON.stringify(shape.tags)}, unbalancedTags ${JSON.stringify(shape.unbalancedTags)}`,
  );
}

beforeEach(() => {
  // Core's development build warns about every tag it leaves as text.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Each fuzz run renders thousands of messages; under a parallel `turbo` run the
// default 5 s per test is not enough.
describe("scanMessageShape's tags against @comvi/core with tag syntax", { timeout: 60_000 }, () => {
  it("agrees on the forms the review named and the table's tag rows", () => {
    expect(NAMED.flatMap((message) => divergences(message)).join("\n  ")).toBe("");
  });

  it("agrees on every order of up to three spellings of one explicit value", () => {
    // Which body core keeps depends on the order: it deduplicates selectors as
    // written first, then spells them as numbers.
    const spellings = ["=1", "=01", "=1.0"];
    const orders: string[][] = [[]];
    for (let length = 0; length < 3; length++) {
      for (const order of orders.filter((o) => o.length === length)) {
        for (const spelling of spellings) orders.push([...order, spelling]);
      }
    }
    const tags = ["b", "i", "em"];
    const messages = orders
      .slice(1)
      .flatMap((order) =>
        ["plural", "selectordinal"].map(
          (type) =>
            `{n, ${type}, ${order.map((s, k) => `${s} {<${tags[k]}/>}`).join(" ")} other {x}}`,
        ),
      );

    expect(messages).toHaveLength(78);
    expect(messages.flatMap((message) => divergences(message)).join("\n  ")).toBe("");
  });

  it("agrees on 1000 generated messages", () => {
    const problems = fuzzedMessages(1000, false).flatMap((message) => divergences(message));

    expect(problems.join("\n  ")).toBe("");
  });

  it("agrees on 1000 generated messages with lone braces, where branches go unchecked", () => {
    const problems = fuzzedMessages(1000, true).flatMap((message) => divergences(message, false));

    expect(problems.join("\n  ")).toBe("");
  });

  it("generates messages that exercise both lists", () => {
    // A generator that never produced a working tag or an unbalanced one
    // would make the run above pass while checking nothing.
    const messages = fuzzedMessages(1000, false);
    const shapes = messages.map(scanMessageShape);
    const reached = messages.filter((message, k) => {
      const shape = shapes[k];
      return allBranchesReached(message, shape, combinations(valueLists(message)).complete);
    });

    // 1000 messages: 495 with a working tag, 629 with an unbalanced one, 745
    // with every branch reached (measured on Node 24).
    expect(shapes.filter((shape) => shape.tags.length > 0).length).toBeGreaterThan(400);
    expect(shapes.filter((shape) => shape.unbalancedTags.length > 0).length).toBeGreaterThan(400);
    expect(reached.length).toBeGreaterThan(600);
  });
});
