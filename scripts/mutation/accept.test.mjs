// The accepted-mutant matcher (accept.mjs): an exemption covers the mutants it names and no
// other — run by `pnpm test:release-tools`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAccepted } from "./accept.mjs";

// One line with two StringLiteral mutants (the two separators of a cache key) and one
// ConditionalExpression mutant, indented by four spaces.
const SOURCE = ["function key(a, b) {", '    return a + "|" + b + ":" + (a ? 1 : 2);', "}"].join(
  "\n",
);
const SNIPPET = 'return a + "|" + b + ":" + (a ? 1 : 2);';
const at = (column) => ({
  start: { line: 2, column: column + 4 },
  end: { line: 2, column: column + 7 },
});
const mutant = (mutatorName, column, replacement, status = "Survived") => ({
  mutatorName,
  replacement,
  status,
  location: at(column),
});
const report = (...mutants) => ({ "src/key.ts": { source: SOURCE, mutants } });
const entry = (extra) => ({ file: "src/key.ts", snippet: SNIPPET, lineHint: 2, ...extra });
const BOTH = [mutant("StringLiteral", 12, '""'), mutant("StringLiteral", 22, '""')];

test("an unpinned entry accepts ONE mutant per listed mutator: a second one on the line survives", () => {
  const r = applyAccepted(report(...BOTH), [entry({ mutators: ["StringLiteral"] })], "/pkg");
  assert.equal(r.totals.accepted, 1);
  assert.equal(r.totals.survived, 1);
  assert.match(
    r.survivors[0],
    /src\/key\.ts:2:22 StringLiteral -> "" \(a second StringLiteral mutant of an accepted line: pin each with "pins"\)/,
  );
  assert.deepEqual(r.stale, []);
});

test("pins accept exactly the mutants they name, by column (from the first non-blank) and replacement", () => {
  const pinned = entry({
    mutators: ["StringLiteral"],
    pins: [{ mutator: "StringLiteral", column: 22, replacement: '""' }],
  });
  const r = applyAccepted(report(...BOTH), [pinned], "/pkg");
  assert.equal(r.totals.accepted, 1);
  assert.deepEqual(r.survivors, ['src/key.ts:2:12 StringLiteral -> ""']);

  // The right column with another replacement, or another mutator, is not accepted.
  const other = applyAccepted(
    report(
      mutant("StringLiteral", 22, '"Stryker was here!"'),
      mutant("ConditionalExpression", 22, '""'),
    ),
    [pinned],
    "/pkg",
  );
  assert.equal(other.totals.accepted, 0);
  assert.equal(other.totals.survived, 2);
  assert.equal(other.stale.length, 1);

  // Two pins accept both.
  const two = entry({
    mutators: ["StringLiteral"],
    pins: [
      { mutator: "StringLiteral", column: 12, replacement: '""' },
      { mutator: "StringLiteral", column: 22, replacement: '""' },
    ],
  });
  assert.equal(applyAccepted(report(...BOTH), [two], "/pkg").totals.accepted, 2);
});

test("one mutant per mutator of a multi-mutator entry; `all` covers the whole line; killed mutants are not touched", () => {
  const mixed = report(
    ...BOTH,
    mutant("ConditionalExpression", 30, "true"),
    mutant("StringLiteral", 1, '""', "Killed"),
  );
  const r = applyAccepted(
    mixed,
    [entry({ mutators: ["StringLiteral", "ConditionalExpression"] })],
    "/pkg",
  );
  assert.deepEqual(r.totals, { killed: 1, survived: 1, accepted: 2, nocov: 0 });
  const all = applyAccepted(mixed, [entry({ mutators: ["all"] })], "/pkg");
  assert.deepEqual(all.totals, { killed: 1, survived: 0, accepted: 3, nocov: 0 });
});

test("an entry whose line text matches nothing is stale", () => {
  const r = applyAccepted(
    report(...BOTH),
    [entry({ snippet: "return gone;", mutators: ["StringLiteral"] })],
    "/pkg",
  );
  assert.equal(r.totals.survived, 2);
  assert.equal(r.stale.length, 1);
});

test("a stale entry with pins and no `mutators` is listed by its pinned mutators", () => {
  const r = applyAccepted(
    report(...BOTH),
    [
      entry({
        snippet: "return gone;",
        pins: [{ mutator: "StringLiteral", column: 1, replacement: '""' }],
      }),
    ],
    "/pkg",
  );
  assert.deepEqual(r.stale, ['src/key.ts [StringLiteral] "return gone;"']);
});
