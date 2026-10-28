/** The source-locale rule (build.ts) — the platform's buildWireKeyV2, case by case. */
import { describe, expect, it } from "vitest";
import { buildWireKey, readMessage } from "../src/index";

const where = { namespace: "default", key: "k" };
const read = (messages: Record<string, string>) =>
  Object.fromEntries(Object.entries(messages).map(([l, m]) => [l, readMessage(m)]));

describe("buildWireKey", () => {
  it("follows the source and reports every difference of the others", () => {
    const { entry, warnings } = buildWireKey(
      read({
        en: "{n, plural, other {#}} {g, select, a {} other {}} <b>x</b>",
        de: "{n, select, other {}} {g, select, a {} z {} other {}} {extra} <i/>",
        fr: "{g, select, a {} other {}}",
        pl: "{n, plural, other {#}} {g, select, a {} other {}} <b>{x</b>",
      }),
      "en",
      where,
    );
    expect(entry).toEqual({
      params: { n: { kind: "plural" }, g: { kind: "select", options: ["a"], other: true } },
      tags: ["b"],
    });
    expect(warnings.map((w) => `${w.locale} ${w.message}`)).toEqual([
      "de {n} is select here but plural in the source",
      "de {g} has options not in the source: z",
      "de {extra} is not in the source message",
      "de tags not in the source: <i>",
      "fr {n} is missing here",
      expect.stringMatching(/^pl syntax error: /),
    ]);
  });

  it("without a source message: the union of the others, choice kinds win, conflicts noted", () => {
    const { entry, warnings } = buildWireKey(
      read({
        de: "{x} {n, plural, other {}} {g, select, a {} other {}} <b/>",
        fr: "<i/> {x, select, q {} other {}} {n, select, other {}} {g, select, b {} c {}}",
      }),
      "en",
      where,
    );
    expect(entry).toEqual({
      params: {
        x: { kind: "select", options: ["q"], other: true },
        n: { kind: "plural" },
        g: { kind: "select", options: ["a", "b", "c"], other: false },
      },
      tags: ["b", "i"],
    });
    expect(warnings.map((w) => `${w.locale ?? "-"} ${w.message}`)).toEqual([
      "- no en (source) message; types come from the other locales",
      "fr syntax error: `{g, select, …}` needs an `other` branch",
      'fr {g, select} has no "other" branch',
      "fr {n} is select here but plural in de; kept plural",
    ]);
  });

  it("a key with no message in any locale has an empty entry", () => {
    expect(buildWireKey({}, "en", where)).toEqual({ entry: {}, warnings: [] });
  });
});
