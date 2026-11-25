// The advisory scope of `pnpm check:snippets` / `check:snippets:types` (scripts/check-snippets.mjs,
// MIGRATION_PENDING_DOCS): explicit per document and rule, never a whole document of the 0.8 API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPendingDocs } from "./check-snippets.mjs";
import { MIGRATION_PENDING_DOCS, pendingDocReason } from "../tooling/migration-pending.mjs";

const finding = (file, rule) => ({ file, rule, advisory: false });
const blocking = (findings) => findings.filter((f) => !f.advisory);

test("a document on the 0.8 API is not listed, so a 0.8 rule blocks it", () => {
  // The nine pages listed only because the 0.7 rules demanded `.use(installer)` left the list
  // with those rules (stage D lot S1); a 0.7 form planted in them now fails the gate.
  const findings = [
    finding("packages/react/README.md", "banned/use-on-instance"),
    finding("packages/vite-plugin/README.md", "banned/icu-compiler"),
    finding("README.md", "banned/removed-entry"),
    finding("examples/README.md", "banned/instance-init"),
  ];
  applyPendingDocs(findings);
  assert.equal(blocking(findings).length, 4);
  for (const file of [
    "README.md",
    "examples/README.md",
    "packages/react/README.md",
    "packages/next/README.md",
    "packages/nuxt/README.md",
    "packages/vue/README.md",
    "packages/solid/README.md",
    "packages/svelte/README.md",
    "packages/vite-plugin/README.md",
  ]) {
    assert.equal(MIGRATION_PENDING_DOCS[file], undefined, file);
  }
});

test("the 0.7 rules are listed nowhere", () => {
  for (const { rules } of Object.values(MIGRATION_PENDING_DOCS)) {
    assert.ok(!rules.includes("required/use-composition"));
    assert.ok(!rules.includes("required/icu-compiler"));
  }
});

// A listed page, as a fixture: the live list shrinks to nothing as stage D rewrites the 0.7 pages,
// and these two tests must keep failing for the right reason when it is empty.
const LISTED = {
  "docs/design/a-07-page.md": {
    reason: "fixture: still on the 0.7 API",
    rules: ["banned/instance-init", "typecheck/error"],
  },
};
const listedReason = (file, rule) =>
  LISTED[file]?.rules.includes(rule) ? LISTED[file].reason : undefined;

test("a listed page's listed rules stay advisory, with its reason", () => {
  const findings = [
    finding("docs/design/a-07-page.md", "banned/instance-init"),
    finding("docs/design/a-07-page.md", "typecheck/error"),
  ];
  const pending = applyPendingDocs(findings, listedReason);
  assert.deepEqual(blocking(findings), []);
  assert.equal(findings[0].rule, "migration-pending/banned/instance-init");
  assert.deepEqual(
    [...pending.get("docs/design/a-07-page.md").rules],
    ["banned/instance-init", "typecheck/error"],
  );
  assert.equal(pending.get("docs/design/a-07-page.md").reason, "fixture: still on the 0.7 API");
});

test("a finding in a document that is not listed blocks the run", () => {
  const findings = [
    finding("packages/editor/README.md", "banned/use-on-instance"),
    finding("docs/design/rich-text.md", "typecheck/error"),
  ];
  applyPendingDocs(findings);
  assert.equal(blocking(findings).length, 2);
});

test("a listed page is advisory only for the rules listed for it", () => {
  const findings = [
    finding("docs/design/a-07-page.md", "banned/instance-init"),
    finding("docs/design/a-07-page.md", "banned/use-on-instance"),
    finding("docs/design/a-07-page.md", "typecheck/sfc-error"),
  ];
  applyPendingDocs(findings, listedReason);
  assert.deepEqual(
    blocking(findings).map((f) => f.rule),
    ["banned/use-on-instance", "typecheck/sfc-error"],
  );
});

test("every live entry names its reason and at least one rule", () => {
  for (const [file, entry] of Object.entries(MIGRATION_PENDING_DOCS)) {
    assert.ok(entry.reason, file);
    assert.ok(Array.isArray(entry.rules) && entry.rules.length > 0, file);
    for (const rule of entry.rules) assert.ok(pendingDocReason(file, rule), `${file}: ${rule}`);
  }
});
