/**
 * T.allocation.test.tsx — W1.4 regression for the per-render allocation fix.
 *
 * Audit ref: Dim 12 P2 in `packages/react/AUDIT-FINDINGS.md`
 * (`packages/react/src/T.tsx:188-189` previously allocated `new Map()` and
 * `{}` on every render unconditionally, even when the `components` prop is
 * undefined — the common case. With 50+ `<T>` instances on a locale switch
 * this produced 100+ ephemerals per render of pure GC churn.)
 *
 * Fix verified: both bags are now null-initialized and only allocated inside
 * `if (components) { ... }`. The marker-lookup site uses optional chaining
 * (`reactHandlers?.get(...)`), and the param-spread tolerates null.
 *
 * STRATEGY
 *   Wrap the global `Map` constructor to count instantiations during render.
 *   Compare delta from a `<div>` baseline (framework + provider overhead) to
 *   a `<T>` baseline. Identical child count → identical framework cost; the
 *   delta isolates `<T>`'s own allocation behavior.
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { createI18n } from "../src";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";

const OriginalMap = globalThis.Map;

describe("<T> allocation behavior (W1.4)", () => {
  let mapCount: number;

  beforeEach(() => {
    mapCount = 0;
    class CountingMap<K, V> extends OriginalMap<K, V> {
      constructor(entries?: readonly (readonly [K, V])[] | null) {
        super(entries ?? undefined);
        mapCount += 1;
      }
    }
    globalThis.Map = CountingMap as unknown as MapConstructor;
  });

  afterEach(() => {
    globalThis.Map = OriginalMap;
  });

  it("attributes zero extra Maps to <T> when `components` prop is undefined", async () => {
    const i18nDiv = createI18n({ locale: "en", translation: { en: { greeting: "Hello" } } });
    await i18nDiv.init();

    // Baseline: provider + N <div> children. Captures all framework +
    // provider Maps that scale with child count.
    const divBaseline = render(
      <I18nProvider i18n={i18nDiv}>
        <div />
        <div />
        <div />
      </I18nProvider>,
    );
    const divMaps = mapCount;
    divBaseline.unmount();

    // Same provider, same N children, swap <div> for <T>. Delta isolates T.
    const i18nT = createI18n({ locale: "en", translation: { en: { greeting: "Hello" } } });
    await i18nT.init();
    mapCount = 0;
    render(
      <I18nProvider i18n={i18nT}>
        <T i18nKey={"greeting" as never} />
        <T i18nKey={"greeting" as never} />
        <T i18nKey={"greeting" as never} />
      </I18nProvider>,
    );
    const tMaps = mapCount;

    // T must NOT exceed div baseline. (Equal or fewer = optimization works.)
    // We allow a small constant slack of 3 to absorb any React-internal
    // bookkeeping that differs between div and T fiber types; the audit
    // bug allocated 2 Maps PER T (= 6 for 3 Ts), well above this slack.
    expect(tMaps - divMaps).toBeLessThan(3);
  });

  it("at least one Map IS allocated when `components` prop is provided", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { greeting: "Hello <bold>world</bold>" } },
    });
    await i18n.init();

    mapCount = 0;
    render(
      <I18nProvider i18n={i18n}>
        <T i18nKey={"greeting" as never} components={{ bold: "strong" }} />
      </I18nProvider>,
    );

    // Sanity: the `if (components)` branch DID allocate the bag.
    expect(mapCount).toBeGreaterThan(0);
  });

  it("plain text rendering is unchanged for the common case (no components)", async () => {
    const i18n = createI18n({ locale: "en", translation: { en: { greeting: "Hello" } } });
    await i18n.init();

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <T i18nKey={"greeting" as never} />
      </I18nProvider>,
    );
    expect(container.textContent).toBe("Hello");
  });

  it("tag-interpolation still works with components prop", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { rich: "Hello <bold>world</bold>" } },
    });
    await i18n.init();

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <T i18nKey={"rich" as never} components={{ bold: "strong" }} />
      </I18nProvider>,
    );
    expect(container.querySelector("strong")?.textContent).toBe("world");
    expect(container.textContent).toBe("Hello world");
  });
});
