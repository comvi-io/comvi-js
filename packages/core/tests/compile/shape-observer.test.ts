/**
 * The development-only shape observer (`Scan.o`): `@comvi/typegen` reads a message's
 * params and tags through THIS scanner (R3-18: no second ICU reader). Production builds
 * fold every call site away (`__DEV__ && P.o`): tests/prod/shape-observer.test.ts.
 */
import { describe, expect, it } from "vitest";
import { message, SYNTAX, type Scan } from "../../src/compile/scanner";

const events = (s: string) => {
  const out: string[] = [];
  const P: Scan = {
    s,
    i: 0,
    k: undefined,
    o: (e, n, t) => out.push(t ? `${e}:${n}:${t}` : `${e}:${n}`),
  };
  let error: string | undefined;
  try {
    message(P, false, false, false);
  } catch (e) {
    if (e !== SYNTAX) throw e;
    error = SYNTAX.m;
  }
  return { out, error };
};

describe("shape observer", () => {
  it("reports plain args, choices with their selectors and ends, and tags, in scan order", () => {
    expect(
      events(
        "Hi {name}, {n, plural, =01 {one <b>{x}</b>} other {# <br/>}} {g, select, a {} other {}}",
      ).out,
    ).toEqual([
      "0:name",
      "1:n:plural",
      "2:=1",
      "4:b",
      "0:x",
      "2:other",
      "4:br",
      "3:n",
      "1:g:select",
      "2:a",
      "2:other",
      "3:g",
    ]);
  });

  it("sees a repeated selector (its sub-message is scanned too) and quoted text not at all", () => {
    expect(events("{n, plural, one {a} one {{y}} other {'{z}'}}").out).toEqual([
      "1:n:plural",
      "2:one",
      "2:one",
      "0:y",
      "2:other",
      "3:n",
    ]);
  });

  it("reports the type before a refused argument fails, and the end before a missing other", () => {
    expect(events("{d, date} {x}")).toEqual({
      out: ["1:d:date"],
      error: "{d, date} is not supported: format it in code with useFormat() and pass a plain {d}",
    });
    expect(events("{n, plural, one {a}} {x}").out).toEqual(["1:n:plural", "2:one", "3:n"]);
  });

  it("changes nothing the scan returns", () => {
    const P: Scan = { s: "{a} <b>{c}</b>", i: 0, k: undefined };
    const Q: Scan = { ...P, o: () => undefined };
    expect(message(Q, false, false, false).length).toBe(message(P, false, false, false).length);
  });
});
