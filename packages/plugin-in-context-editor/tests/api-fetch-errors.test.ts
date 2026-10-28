/**
 * The request path copied from 0.7's `@comvi/plugin-fetch-loader` (lot 2c) throws under the
 * editor's own name: that package is gone in 0.8. Asserted on errors actually thrown, not
 * on the source text (the prefix is concatenated at run time).
 */
import { describe, expect, it } from "vitest";
import { assertCatalogObject, validateId } from "../src/api-fetch/http-core";

describe("api-fetch errors", () => {
  it("name @comvi/plugin-in-context-editor, never the deleted @comvi/plugin-fetch-loader", () => {
    const thrown: string[] = [];
    for (const f of [() => validateId("..", "locale"), () => assertCatalogObject([], "API", "x")])
      try {
        f();
      } catch (e) {
        thrown.push((e as Error).message);
      }
    expect(thrown).toHaveLength(2);
    for (const m of thrown) {
      expect(m.startsWith("[@comvi/plugin-in-context-editor] ")).toBe(true);
      expect(m).not.toContain("plugin-fetch-loader");
    }
  });
});
