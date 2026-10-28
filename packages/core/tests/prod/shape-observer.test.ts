/**
 * Production (`__DEV__` false): the scanner never calls the typegen shape observer — its
 * call sites are `__DEV__ && P.o && …` and fold away (0 B in the production rows of
 * scripts/size-budgets.json).
 */
import { expect, it, vi } from "vitest";
import { message, type Scan } from "../../src/compile/scanner";

it("never calls the shape observer", () => {
  const o = vi.fn();
  const P: Scan = { s: "{a} {n, plural, one {<b>x</b>} other {#}}", i: 0, k: undefined, o };
  message(P, false, false, false);
  expect(o).not.toHaveBeenCalled();
});
