// The advisory scope of `pnpm check:snippets` / `check:snippets:types` (scripts/check-snippets.mjs,
// MIGRATION_PENDING_DOCS): explicit per document and rule, never a whole document of the 0.8 API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPendingDocs } from "./check-snippets.mjs";
import { pendingDocReason } from "../tooling/migration-pending.mjs";

const finding = (file, rule) => ({ file, rule, advisory: false });
const blocking = (findings) => findings.filter((f) => !f.advisory);

test("a type error in a 0.8 document whose LINT rules are pending blocks the run", () => {
  const findings = [finding("packages/react/README.md", "typecheck/error")];
  applyPendingDocs(findings);
  assert.equal(blocking(findings).length, 1);
  assert.equal(pendingDocReason("packages/vue/README.md", "typecheck/sfc-error"), undefined);
  assert.equal(pendingDocReason("README.md", "banned/unresolved-comvi-import"), undefined);
});

test("the 0.7 composition LINT rules stay advisory in those documents", () => {
  const findings = [
    finding("packages/react/README.md", "required/use-composition"),
    finding("packages/vite-plugin/README.md", "required/icu-compiler"),
  ];
  const pending = applyPendingDocs(findings);
  assert.deepEqual(blocking(findings), []);
  assert.equal(findings[0].rule, "migration-pending/required/use-composition");
  assert.deepEqual(
    [...pending.get("packages/react/README.md").rules],
    ["required/use-composition"],
  );
});

test("a finding in a document that is not listed blocks the run", () => {
  const findings = [
    finding("packages/editor/README.md", "required/use-composition"),
    finding("docs/design/rich-text.md", "typecheck/error"),
  ];
  applyPendingDocs(findings);
  assert.equal(blocking(findings).length, 2);
});

test("a 0.7 page is advisory only for the rules listed for it", () => {
  assert.ok(pendingDocReason("docs/design/composition.md", "typecheck/error"));
  assert.equal(pendingDocReason("docs/design/composition.md", "typecheck/sfc-error"), undefined);
  assert.equal(
    pendingDocReason("docs/design/composition.md", "required/use-composition"),
    undefined,
  );
});
