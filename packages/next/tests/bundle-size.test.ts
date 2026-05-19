/**
 * bundle-size.test.ts — C3 bundle-size gate for @comvi/next
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
  "createNextI18n.js": { raw: 5300, gz: 1700 },
  "createNextI18n.cjs": { raw: 5400, gz: 1700 },
  "index.js": { raw: 200, gz: 110 },
  "index.cjs": { raw: 580, gz: 290 },
  "client.js": { raw: 250, gz: 150 },
  "client.cjs": { raw: 890, gz: 320 },
  "server.js": { raw: 390, gz: 160 },
  "server.cjs": { raw: 740, gz: 260 },
  "middleware.js": { raw: 110, gz: 90 },
  "middleware.cjs": { raw: 250, gz: 170 },
  "navigation.js": { raw: 210, gz: 140 },
  "navigation.cjs": { raw: 390, gz: 220 },
  "routing.js": { raw: 161, gz: 120 },
  "routing.cjs": { raw: 360, gz: 200 },
};

describe("@comvi/next bundle-size gate (C3)", () => {
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
