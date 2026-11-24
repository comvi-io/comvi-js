/**
 * Production (`__DEV__` false): a scan adds no field to its `Scan`. Every compiled message
 * that reads a parameter keeps its `Scan` alive (for the key in reports), so one more field
 * there is heap per compiled message: B12's `Scan.h` cost ~20 B per key over a compiled 10K
 * catalog (scripts/perf.mjs --heap-per-key: 325 → 345.5) and made `add()` over it 13–24 %
 * slower. Counted by shape, not by clock or heap.
 */
import { expect, it } from "vitest";
import { message, type Scan } from "../../src/compile/scanner";

it.each([
  "Hi {name}",
  "{n, plural, one {<b>#</b>} other {# <i>x}} {g, select, a {<br/>} other {{x}}}",
  "a<br>b <b>c</b>",
])("scanning %s leaves the Scan with its three fields only", (s) => {
  const P: Scan = { s, i: 0, k: "k" };

  message(P, false, false, 0);

  expect(Object.keys(P)).toEqual(["s", "i", "k"]);
});
