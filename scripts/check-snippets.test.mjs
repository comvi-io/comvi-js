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

test("a 0.7 page's listed rules stay advisory, with its reason", () => {
  const findings = [
    finding("packages/core/README.md", "banned/instance-init"),
    finding("docs/design/icu.md", "banned/icu-compiler"),
  ];
  const pending = applyPendingDocs(findings);
  assert.deepEqual(blocking(findings), []);
  assert.equal(findings[0].rule, "migration-pending/banned/instance-init");
  assert.deepEqual([...pending.get("packages/core/README.md").rules], ["banned/instance-init"]);
});

test("a finding in a document that is not listed blocks the run", () => {
  const findings = [
    finding("packages/editor/README.md", "banned/use-on-instance"),
    finding("docs/design/rich-text.md", "typecheck/error"),
  ];
  applyPendingDocs(findings);
  assert.equal(blocking(findings).length, 2);
});

test("a 0.7 page is advisory only for the rules listed for it", () => {
  assert.ok(pendingDocReason("docs/design/composition.md", "typecheck/error"));
  assert.ok(pendingDocReason("docs/design/composition.md", "banned/use-on-instance"));
  assert.equal(pendingDocReason("docs/design/composition.md", "typecheck/sfc-error"), undefined);
  assert.equal(pendingDocReason("docs/design/composition.md", "banned/instance-init"), undefined);
  assert.equal(pendingDocReason("packages/core/README.md", "banned/use-on-instance"), undefined);
});
