/**
 * The two halves of `#dev-warn` (see `src/dev-warn.ts` for why the split
 * exists). Both are imported by RELATIVE path here, never through
 * `#dev-warn`: the point is to exercise each half on its own, while the
 * package's `imports` map — and the vitest alias that stands in for it — only
 * ever hands a test ONE of them.
 *
 * The dist-level half of the claim (which file the `development` condition
 * actually selects, and that the production artifact does not contain the
 * text) lives in `tests/exports-smoke.test.ts` and in the bundler-matrix
 * `*-dev-conditions` cases.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as prod from "../src/dev-warn";
import * as dev from "../src/dev-warn.dev";

const DEPRECATION = "[i18n] <T raw> is deprecated.";

describe("#dev-warn halves", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("export the SAME names — a name on one half only breaks the other artifact", () => {
    // The production half is what `default` resolves to and the development
    // half what `development` resolves to; a consumer imports the same
    // specifier either way, so the two surfaces are one contract.
    expect(Object.keys(dev).sort()).toEqual(Object.keys(prod).sort());
    for (const name of Object.keys(dev) as (keyof typeof dev)[]) {
      expect(typeof prod[name], `${name} must be callable in the production half`).toBe(
        typeof dev[name],
      );
    }
  });

  it("development half warns once per host, and separately per host", () => {
    const hostA = {};
    const hostB = {};

    dev.warnDeprecatedRawProp(hostA);
    dev.warnDeprecatedRawProp(hostA);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(DEPRECATION);

    dev.warnDeprecatedRawProp(hostB);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("production half is silent", () => {
    const host = {};
    prod.warnDeprecatedRawProp(host);
    prod.warnDeprecatedRawProp({});
    expect(warn).not.toHaveBeenCalled();
  });
});
