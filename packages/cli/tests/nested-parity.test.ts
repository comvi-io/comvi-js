/**
 * Nested catalogs (lot 6a, D1): `push` flattens a local file by the core's own rule
 * (`packages/core/src/flat.ts`, through @comvi/typegen), on the core's cases
 * (`packages/core/tests/fixtures/nested/cases.json`). What the runtime would leave out — a
 * collision, an invalid leaf — refuses the file here.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flattenTranslationFile } from "../src/core/TranslationSync";

type Case = { name: string; input: object; flat: Record<string, string>; left: [string, number][] };
const { cases } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../core/tests/fixtures/nested/cases.json"), "utf8"),
) as { cases: Case[] };

describe("the CLI flattens like the core", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const run = () => flattenTranslationFile(c.input as Record<string, unknown>, "en.json");
    if (c.left.length === 0) {
      expect(Object.fromEntries(Object.entries(run()))).toEqual(c.flat);
      return;
    }
    const [key, kind] = c.left[0];
    expect(run).toThrow(
      kind === 1 ? `"${key}" is defined both as a flat key and through nesting` : `key "${key}" is`,
    );
  });
});
