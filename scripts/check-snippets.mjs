#!/usr/bin/env node
// `pnpm check:snippets`: the docs snippet gate (scripts/docs-snippets/run.mjs) over this
// repo's npm surface, with MIGRATION_PENDING applied (tooling/migration-pending.mjs):
// findings in a page whose API is pending — a README of a pending package, or a page in
// MIGRATION_PENDING_DOCS — are reported as advisory `migration-pending/<rule>` with the
// reason, so they neither fail the run nor go unseen.
//
// A wrapper rather than an edit to scripts/docs-snippets/: that module is copied into the
// www repository and hash-pinned (module-sha.mjs), and must not import this repo's tooling.
import path from "node:path";
import { formatReport, parseArgs, runGate } from "./docs-snippets/run.mjs";
import { ROOT, pendingDocReason } from "../tooling/migration-pending.mjs";

const options = parseArgs(process.argv.slice(2));
const result = runGate(options);
if (path.resolve(options.root) === ROOT) {
  const pending = new Map();
  for (const finding of result.findings) {
    const reason = pendingDocReason(finding.file);
    if (!reason || finding.advisory) continue;
    finding.advisory = true;
    finding.rule = `migration-pending/${finding.rule}`;
    pending.set(finding.file, reason);
  }
  for (const [file, reason] of pending)
    console.log(`docs-snippets: ${file} — findings advisory, MIGRATION_PENDING (${reason})`);
}
console.log(formatReport(result));
process.exit(result.findings.some((finding) => !finding.advisory) ? 1 : 0);
