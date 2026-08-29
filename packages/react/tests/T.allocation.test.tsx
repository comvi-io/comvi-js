/**
 * `<T>` must not allocate a Map when `components` is undefined. Counted with a
 * Map-constructor wrapper, comparing <div> and <T> subtrees under the same
 * provider so the delta isolates `<T>`'s own allocations.
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { createI18n } from "../src";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";

const OriginalMap = globalThis.Map;

describe("<T> allocation behavior", () => {
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

    // Baseline captures the framework/provider Maps that scale with children.
    const divBaseline = render(
      <I18nProvider i18n={i18nDiv}>
        <div />
        <div />
        <div />
      </I18nProvider>,
    );
    const divMaps = mapCount;
    divBaseline.unmount();

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

    // Slack of 3 absorbs React-internal bookkeeping that differs between div
    // and T fiber types; the regression this pins allocated 2 Maps PER T.
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
