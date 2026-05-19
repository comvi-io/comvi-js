/**
 * audit-matrix-coverage.test.ts — W4 CI gate for the audit verification matrix.
 *
 * Per `docs/audit-verification-matrix.md`, every audit finding (24 total) has
 * a closing artifact: either a test file (auto), a JSDoc / source comment
 * (manual), an ADR document (manual), or a positive-observation note (n/a).
 *
 * This test asserts that every artifact FILE referenced in the matrix
 * actually exists on disk. If a future PR deletes one of these files
 * without updating the matrix, this test fails — preventing matrix rot
 * (Critic Delta 7 in the iter-2 plan review).
 *
 * Non-file artifacts (JSDoc text, source comments) are listed in the
 * matrix as `manual` mode and not checked here — they live as reviewable
 * markers in the source PRs.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../../..");

/**
 * Required-to-exist artifacts. If you add a new audit finding with a new
 * test or doc, add the path here. If you DELETE a referenced artifact,
 * either update this list (and the matrix) or fail.
 */
const requiredArtifacts: string[] = [
  // Tests (auto-mode closures)
  "packages/react/tests/render-counts.test.tsx",
  "packages/react/tests/tearing.test.tsx",
  "packages/react/tests/useSubscribe.test.tsx",
  "packages/react/tests/T.allocation.test.tsx",
  "packages/react/tests/effect-rerun.test.tsx",
  "packages/react/tests/ssr.node.test.tsx",
  "packages/react/tests/useI18n.test.tsx",
  "packages/next/tests/I18nProvider.test.tsx",
  "packages/next/tests/next-hydration.test.tsx",
  "packages/core/tests/features/formatting-locale-override.test.ts",

  // ADRs (manual-mode closures)
  "docs/adr/0001-i18n-locale-source.md",
  "docs/adr/0002-context-split.md",
  "docs/adr/0003-suspense-integration.md",
  "docs/adr/0004-T-generic-vs-memo.md",

  // Migration + matrix + plan
  "docs/migration/v0.2-to-v0.3.md",
  "docs/audit-verification-matrix.md",
  "docs/plans/v0.3-fix-everything.md",

  // Audit deliverables
  "AUDIT-react-packages.md",
  "packages/react/AUDIT-FINDINGS.md",
  "packages/react/AUDIT-CONCURRENCY.md",
];

describe("Audit verification matrix coverage (W4)", () => {
  for (const relPath of requiredArtifacts) {
    it(`artifact exists: ${relPath}`, () => {
      const fullPath = resolve(REPO_ROOT, relPath);
      expect(
        existsSync(fullPath),
        `Audit matrix references "${relPath}" but the file is missing. ` +
          `Either restore it or update docs/audit-verification-matrix.md AND ` +
          `this test's required-artifacts list.`,
      ).toBe(true);
    });
  }

  it("matrix file contains the closing-PR commit table", () => {
    // Sanity: matrix self-reports the commit log. If someone removes that
    // section without updating this test, fail loudly.
    const matrix = readFileSync(resolve(REPO_ROOT, "docs/audit-verification-matrix.md"), "utf8");
    expect(matrix).toMatch(/## Plan PRs/);
    expect(matrix).toMatch(/W2b-ii/);
    expect(matrix).toMatch(/W2c/);
  });

  it("matrix accounts for the 24 audit findings + 4 ADRs", () => {
    const matrix = readFileSync(resolve(REPO_ROOT, "docs/audit-verification-matrix.md"), "utf8");
    // Look for the counts summary block.
    expect(matrix).toMatch(/P1 closed.*2 \/ 2/);
    expect(matrix).toMatch(/P2 closed.*14 \/ 14/);
    expect(matrix).toMatch(/P3 closed.*8 \/ 8/);
    expect(matrix).toMatch(/ADR open questions resolved.*4 \/ 4/);
    expect(matrix).toMatch(/24 \/ 24 audit findings addressed/);
  });
});
