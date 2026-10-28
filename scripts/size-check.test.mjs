// size-check.mjs: the design-ceiling branch (reference-i18n R3-10), the increment cap (the
// R3-10 binding cap) and the informational remaining-bytes line. None needs a build: the
// ceiling check runs before bundling, the increment cap on measured results.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyIncrementCaps,
  renderDesignCeilings,
  renderResults,
  runSizeCheck,
} from "./size-check.mjs";

const row = (over) => ({
  name: "row",
  entry: ["@comvi/core"],
  fixture: "never-read.ts",
  gzipBudgetBytes: 100,
  ...over,
});

test("a row whose budget exceeds its design ceiling fails before it is measured", async () => {
  const results = await runSizeCheck({
    budgets: { fixtures: [row({ gzipBudgetBytes: 2001, ceilingBytes: 2000 })] },
    fixturesDir: "/nonexistent",
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "fail");
  assert.match(results[0].reason, /gzipBudgetBytes 2001 exceeds the design ceiling 2000/);
  assert.match(
    renderResults(results),
    /^x row: gzipBudgetBytes 2001 exceeds the design ceiling 2000$/,
  );
});

test("a MIGRATION_PENDING entry is skipped before the ceiling check", async () => {
  const results = await runSizeCheck({
    budgets: { fixtures: [row({ gzipBudgetBytes: 2001, ceilingBytes: 2000 })] },
    fixturesDir: "/nonexistent",
    pending: (name) => (name === "@comvi/core" ? "lot 1b" : undefined),
  });
  assert.equal(results[0].status, "skipped");
});

test("the remaining-bytes line reads the measured row", () => {
  const line = renderDesignCeilings(
    [{ name: "core + ICU (R3-10)", bytes: 3250, measuredBy: "a", missing: "the instance" }],
    [{ name: "a", status: "pass", gzipBytes: 2383 }],
  );
  assert.equal(
    line,
    "i core + ICU (R3-10) <= 3250 B: a measures 2383 B, 867 B left for the instance",
  );
  assert.match(
    renderDesignCeilings([{ name: "x", bytes: 1, measuredBy: "gone", missing: "y" }], []),
    /gone not measured/,
  );
});

test("an increment cap fails a row that adds more than its cap over the base row", () => {
  const fixtures = [
    { name: "base" },
    { name: "react", increment: { over: "base", maxBytes: 500 } },
  ];
  const measured = (react) => [
    { name: "base", status: "pass", gzipBytes: 4661, minBytes: 1, budget: 9999 },
    { name: "react", status: "pass", gzipBytes: react, minBytes: 1, budget: 9999 },
  ];
  const ok = applyIncrementCaps(fixtures, measured(5161));
  assert.equal(ok[1].status, "pass");
  assert.match(renderResults(ok), /\+500 B over base <= cap \+500 B/);
  const over = applyIncrementCaps(fixtures, measured(5162));
  assert.equal(over[1].status, "fail");
  assert.match(renderResults(over), /^x react: .*\+501 B over base vs cap \+500 B$/m);
});

test("an increment cap over a row that was not measured fails", () => {
  const results = applyIncrementCaps(
    [{ name: "react", increment: { over: "gone", maxBytes: 500 } }],
    [{ name: "react", status: "pass", gzipBytes: 1, minBytes: 1, budget: 9 }],
  );
  assert.equal(results[0].status, "fail");
  assert.match(results[0].reason, /not measured/);
});
