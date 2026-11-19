#!/usr/bin/env node
// `pnpm check:snippets`: the docs snippet gate (scripts/docs-snippets/run.mjs) over this
// repo's npm surface, with MIGRATION_PENDING applied (tooling/migration-pending.mjs):
// a finding is advisory `migration-pending/<rule>`, with the reason, only when it is in a
// README of a pending package or its rule is one MIGRATION_PENDING_DOCS lists for that
// document; every other finding blocks. Advisory findings are printed, not hidden.
//
// A wrapper rather than an edit to scripts/docs-snippets/: that module is copied into the
// www repository and hash-pinned (module-sha.mjs), and must not import this repo's tooling.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatReport, parseArgs, runGate } from "./docs-snippets/run.mjs";
import { ROOT, pendingDocReason } from "../tooling/migration-pending.mjs";

/** Marks the findings MIGRATION_PENDING makes advisory; returns document → advisory rules. */
export function applyPendingDocs(findings, reasonOf = pendingDocReason) {
  const pending = new Map();
  for (const finding of findings) {
    if (finding.advisory) continue;
    const reason = reasonOf(finding.file, finding.rule);
    if (!reason) continue;
    const rules = pending.get(finding.file) ?? { reason, rules: new Set() };
    rules.rules.add(finding.rule);
    pending.set(finding.file, rules);
    finding.advisory = true;
    finding.rule = `migration-pending/${finding.rule}`;
  }
  return pending;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const result = runGate(options);
  if (path.resolve(options.root) === ROOT) {
    for (const [file, { reason, rules }] of applyPendingDocs(result.findings))
      console.log(
        `docs-snippets: ${file} — ${[...rules].join(", ")} advisory, MIGRATION_PENDING (${reason})`,
      );
  }
  console.log(formatReport(result));
  process.exit(result.findings.some((finding) => !finding.advisory) ? 1 : 0);
}
