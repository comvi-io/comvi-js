/**
 * THE PARITY GUARD of the v2 reader: the params and tags `readMessage` reports for a
 * message must be exactly the names `@comvi/core` READS when it renders that message —
 * no more (a param the types demand and no render reads) and no fewer (one TypeScript
 * would reject at a call the runtime needs).
 *
 * The reader is core's own scanner (src/v2/read.ts), so the grammar cannot drift; what
 * this measures is the RECORDING: which events become params, muted repeated
 * selectors, select options. Nothing here is a hand-written expectation of params:
 * each message is compiled by core (`compile`, source), rendered with a params object
 * that logs every own-property lookup (core reads params only through
 * `Object.prototype.hasOwnProperty`, `scanner.ts` `arg`), and every branch is explored
 * by rendering with the message's own words and a few numbers as values, in every
 * combination, until no new name is read.
 */
import { describe, expect, it } from "vitest";
import { compile } from "../../core/src/compile/cache";
import { readMessage } from "../src/index";

const MESSAGES = [
  // Plain params.
  "Hi {name}",
  "Hi {name }",
  "{ spaced }",
  "{0} items",
  "{a}{b}",
  "no params at all",
  // Choices.
  "{count, plural, one {# item} other {# items}}",
  "{count, plural, one {item} other {items}}",
  "{place, selectordinal, one {#st} other {#th}}",
  "{gender, select, male {he} female {she} other {they}}",
  "{count, plural, other {# of {total}}}",
  "{count, plural, other {#}} of {count}",
  "{count,plural,other{#}}",
  "{ count , plural , other {#} }",
  "{n, plural, offset:1 =0 {none} one {{who}} other {{who} and # more}}",
  "{n, plural, =-1 {a} =1.5 {b} =01 {c} other {d}}",
  // Nesting.
  "{g, select, female {{n, plural, one {her {x}} other {her #}}} other {{y}}}",
  "{a, select, x {{b, select, y {{c}} other {}}} other {}}",
  // A repeated selector: core keeps the first sub-message; the second never renders.
  "{n, plural, one {a} one {{hidden}} other {b}}",
  "{g, select, a {{x}} a {{hidden}} other {<t>never</t>}}",
  // Tags: the handler is the param of the tag's name.
  "<link>terms</link>",
  "Read <b>{name}</b> and <br/>",
  "{n, plural, one {<em>#</em>} other {<strong>#</strong>}}",
  "<a>x</a><a>y</a>",
  // Quoting (ICU DOUBLE_OPTIONAL as core reads it).
  "'{name}' stays literal",
  "'{name}' but {real}",
  "It''s {name}",
  "''{name}''",
  "Superiors' behavior for {name}",
  "'<b>' is text, {x} is not",
  "{count, plural, other {'#' of {total}}}",
  "'#' {n}",
  // Messages core refuses: the key renders; the reader reports `error`.
  "{total, number}",
  "{when, date, short}",
  "{at, time}",
  "{x, wobble, other {a}}",
  "{count, plural}",
  "{count, plural, one {x}}",
  "{count, select, male he}",
  "a { b {name}",
  "<b>never closed",
  "</b> closes nothing",
  "{n, plural, =x {a} other {b}}",
] as const;

/** Every param name core reads when rendering `template`, over every branch it can take. */
function runtimeReads(template: string): { reads: string[]; syntax: boolean } {
  const compiled = compile(template, "k");
  if (typeof compiled === "string") return { reads: [], syntax: false };
  let syntax = false;
  const env = { r: (e: { code: string }) => void (e.code === "syntax" && (syntax = true)) };
  const values: Array<string | number> = [
    0,
    1,
    2,
    5,
    ...new Set(template.match(/[A-Za-z_]\w*/g) ?? []),
  ];
  const reads = new Set<string>();
  const render = (assign: Record<string, unknown>) => {
    const logged = new Proxy(assign, {
      getOwnPropertyDescriptor(target, key) {
        if (typeof key === "string") reads.add(key);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    compiled(logged, "en", env);
  };
  let known = -1;
  // Exhaust the combinations of values for the names read so far, until none is new.
  while (reads.size !== known) {
    known = reads.size;
    const names = [...reads];
    const combos = (i: number, acc: Record<string, unknown>) => {
      if (i === names.length) return render({ ...acc });
      for (const v of values) combos(i + 1, { ...acc, [names[i]]: v });
      // A tag's handler: a function value.
      combos(i + 1, { ...acc, [names[i]]: (c: unknown) => c });
    };
    if (names.length === 0) render({});
    else combos(0, {});
  }
  return { reads: [...reads].sort(), syntax };
}

describe("readMessage against what @comvi/core reads at render time", () => {
  it("names exactly the params and tags core reads, for every message form", () => {
    const divergences: string[] = [];
    for (const message of MESSAGES) {
      const runtime = runtimeReads(message);
      const read = readMessage(message);
      if (runtime.syntax) {
        // Core renders the key and reads nothing; the reader must say the message is broken.
        if (read.error === undefined)
          divergences.push(
            `${JSON.stringify(message)}: core reports syntax, the reader has no error`,
          );
        continue;
      }
      if (read.error !== undefined)
        divergences.push(
          `${JSON.stringify(message)}: the reader reports "${read.error}", core renders it`,
        );
      const generated = [...new Set([...read.params.map((p) => p.name), ...read.tags])].sort();
      if (JSON.stringify(generated) !== JSON.stringify(runtime.reads))
        divergences.push(
          `${JSON.stringify(message)}\n    core reads    ${JSON.stringify(runtime.reads)}\n    reader names  ${JSON.stringify(generated)}`,
        );
    }
    expect(divergences.join("\n  ")).toBe("");
  });

  it("explores nested branches (the harness itself reaches a param three levels down)", () => {
    expect(runtimeReads("{a, select, x {{b, select, y {{c}} other {}}} other {}}").reads).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("readMessage records what the platform's v2 extractor records", () => {
  it("kinds, select options in message order and `other`, tags in first-seen order", () => {
    expect(
      readMessage(
        "{g, select, male {he} female {<b>she</b>} other {they}} {n, selectordinal, other {#}} <i/>",
      ),
    ).toEqual({
      params: [
        { name: "g", kind: "select", options: ["male", "female"], other: true },
        { name: "n", kind: "selectordinal" },
      ],
      tags: ["b", "i"],
      diagnostics: [],
    });
  });

  it("merges two uses of a select; a choice kind replaces a plain {x}; conflicts are noted", () => {
    expect(readMessage("{x} {x, plural, other {#}}").params).toEqual([
      { name: "x", kind: "plural" },
    ]);
    expect(readMessage("{g, select, a {} other {}} {g, select, b {} other {}}").params).toEqual([
      { name: "g", kind: "select", options: ["a", "b"], other: true },
    ]);
    const conflict = readMessage("{n, plural, other {}} {n, select, other {}}");
    expect(conflict.params).toEqual([{ name: "n", kind: "plural" }]);
    expect(conflict.diagnostics).toEqual(["{n} is used as plural and as select; kept plural"]);
  });

  it("leaves out what a repeated selector's sub-message would add", () => {
    expect(readMessage("{g, select, a {} a {{h} <t/>} other {}}")).toEqual({
      params: [{ name: "g", kind: "select", options: ["a"], other: true }],
      tags: [],
      diagnostics: [],
    });
  });

  it("keeps what was read before a syntax error, with its kind for number/date/time", () => {
    expect(readMessage("{a} {d, date} {b}")).toMatchObject({
      params: [
        { name: "a", kind: "string" },
        { name: "d", kind: "date" },
      ],
      error: expect.stringContaining("useFormat()"),
    });
    expect(readMessage("{x, plural}").params).toEqual([]);
    const noOther = readMessage("{n, plural, one {a}}");
    expect(noOther.params).toEqual([{ name: "n", kind: "plural" }]);
    expect(noOther.diagnostics).toEqual(['{n, plural} has no "other" branch']);
    expect(noOther.error).toBeDefined();
  });
});
