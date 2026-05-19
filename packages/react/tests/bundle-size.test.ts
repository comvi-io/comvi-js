/**
 * bundle-size.test.ts — C3 bundle-size gate for @comvi/react
 *
 * Measures raw and gzip sizes of dist artifacts.
 * Skips cleanly when dist is absent (CI builds dist before running tests).
 *
 * Budgets = observed size + 10% headroom (rounded to nearest 100 bytes).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const distDir = join(import.meta.dirname, "../dist");

const BUDGETS: Record<string, { raw: number; gz: number }> = {
  "comvi-react.js": { raw: 6100, gz: 2400 },
  "comvi-react.cjs": { raw: 7300, gz: 2650 },
};

describe("@comvi/react bundle-size gate (C3)", () => {
  it.skipIf(!existsSync(distDir))("all dist JS/CJS files are within size budgets", () => {
    const failures: string[] = [];

    for (const [filename, budget] of Object.entries(BUDGETS)) {
      const filePath = join(distDir, filename);

      if (!existsSync(filePath)) {
        failures.push(`${filename}: file missing from dist`);
        continue;
      }

      const buf = readFileSync(filePath);
      const gz = gzipSync(buf);

      if (buf.length > budget.raw) {
        failures.push(
          `${filename}: raw ${buf.length} bytes exceeds budget ${budget.raw} bytes (+${buf.length - budget.raw})`,
        );
      }
      if (gz.length > budget.gz) {
        failures.push(
          `${filename}: gzip ${gz.length} bytes exceeds budget ${budget.gz} bytes (+${gz.length - budget.gz})`,
        );
      }
    }

    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});
