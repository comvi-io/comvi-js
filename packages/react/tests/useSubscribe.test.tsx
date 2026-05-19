/**
 * useSubscribe identity stability: rest-args + a join-key derivation so
 * callback identity churns iff the event-list contents change (not on every
 * render with a fresh literal).
 */

import React, { useEffect, useRef } from "react";
import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";

import { useSubscribe } from "../src/I18nProvider";
import { FakeI18n } from "../../../tooling/test-utils/fakeI18n";
import type { I18nEvent } from "@comvi/core";

describe("useSubscribe — rest-args + stable join-key deps", () => {
  function Probe({
    fake,
    events,
    onSub,
  }: {
    fake: FakeI18n;
    events: I18nEvent[];
    onSub: (sub: (cb: () => void) => () => void) => void;
  }) {
    const sub = useSubscribe(fake.asI18n(), ...events);
    const lastSub = useRef<typeof sub | null>(null);
    if (lastSub.current !== sub) {
      lastSub.current = sub;
      onSub(sub);
    }
    return null;
  }

  it("returns stable subscribe identity when event LIST is unchanged across renders", () => {
    const fake = new FakeI18n();
    const subs: Array<(cb: () => void) => () => void> = [];

    const { rerender } = render(
      <Probe fake={fake} events={["localeChanged", "initialized"]} onSub={(s) => subs.push(s)} />,
    );

    // Same content, different array identity — must NOT trigger a new
    // subscribe identity (fresh literal each render is the production shape).
    rerender(
      <Probe fake={fake} events={["localeChanged", "initialized"]} onSub={(s) => subs.push(s)} />,
    );
    rerender(
      <Probe fake={fake} events={["localeChanged", "initialized"]} onSub={(s) => subs.push(s)} />,
    );

    expect(subs.length).toBe(1);
  });

  it("returns NEW subscribe identity when event list contents change", () => {
    const fake = new FakeI18n();
    const subs: Array<(cb: () => void) => () => void> = [];

    const { rerender } = render(
      <Probe fake={fake} events={["localeChanged"]} onSub={(s) => subs.push(s)} />,
    );
    expect(subs.length).toBe(1);

    // Add an event — identity MUST change so a useEffect using sub as a dep
    // re-runs and re-subscribes to the new event set. This is the fragility
    // the fix targets.
    rerender(
      <Probe fake={fake} events={["localeChanged", "initialized"]} onSub={(s) => subs.push(s)} />,
    );
    expect(subs.length).toBe(2);

    // Reorder — different join("|") key — also a new identity.
    rerender(
      <Probe fake={fake} events={["initialized", "localeChanged"]} onSub={(s) => subs.push(s)} />,
    );
    expect(subs.length).toBe(3);

    // Drop one — different join("|") key — also a new identity.
    rerender(<Probe fake={fake} events={["initialized"]} onSub={(s) => subs.push(s)} />);
    expect(subs.length).toBe(4);
  });

  it("returns NEW subscribe identity when the i18n instance changes", () => {
    const fakeA = new FakeI18n();
    const fakeB = new FakeI18n();
    const subs: Array<(cb: () => void) => () => void> = [];

    const { rerender } = render(
      <Probe fake={fakeA} events={["localeChanged"]} onSub={(s) => subs.push(s)} />,
    );
    expect(subs.length).toBe(1);

    rerender(<Probe fake={fakeB} events={["localeChanged"]} onSub={(s) => subs.push(s)} />);
    expect(subs.length).toBe(2);
  });

  it("subscribed callback fires for each event in the list and unsubscribes cleanly", async () => {
    const fake = new FakeI18n();
    let subscribeFn: ((cb: () => void) => () => void) | null = null;

    function Driver() {
      const sub = useSubscribe(fake.asI18n(), "localeChanged", "namespaceLoaded");
      useEffect(() => {
        subscribeFn = sub;
      }, [sub]);
      return null;
    }

    render(<Driver />);
    expect(subscribeFn).not.toBeNull();

    let firedCount = 0;
    const unsubscribe = subscribeFn!(() => {
      firedCount += 1;
    });

    // Both subscribed events should trigger the callback.
    await act(async () => {
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });
    expect(firedCount).toBe(1);

    await act(async () => {
      fake.emit("namespaceLoaded", { locale: "en", namespace: "common" });
    });
    expect(firedCount).toBe(2);

    // An UN-subscribed event must NOT fire.
    await act(async () => {
      fake.emit("loadingStateChanged", { isLoading: true });
    });
    expect(firedCount).toBe(2);

    // After unsubscribe, no more deliveries.
    unsubscribe();
    await act(async () => {
      fake.emit("localeChanged", { from: "fr", to: "de" });
    });
    expect(firedCount).toBe(2);
  });
});
