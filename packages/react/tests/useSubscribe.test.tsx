/**
 * Callback identity must churn iff the event-list CONTENTS change — a fresh
 * array literal each render (the production shape) must not churn it.
 */

import React, { useEffect, useRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";

import { useSubscribe } from "../src/I18nProvider";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";
import type { I18nEvent, I18nEventData } from "@comvi/core";

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

    // Same contents, different array identity.
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

    // Identity MUST change so a `useEffect` holding `sub` as a dep re-runs and
    // subscribes to the new event set.
    rerender(
      <Probe fake={fake} events={["localeChanged", "initialized"]} onSub={(s) => subs.push(s)} />,
    );
    expect(subs.length).toBe(2);

    rerender(
      <Probe fake={fake} events={["initialized", "localeChanged"]} onSub={(s) => subs.push(s)} />,
    );
    expect(subs.length).toBe(3);

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

    await act(async () => {
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });
    expect(firedCount).toBe(1);

    await act(async () => {
      fake.emit("namespaceLoaded", { locale: "en", namespace: "common" });
    });
    expect(firedCount).toBe(2);

    await act(async () => {
      // Nothing subscribes to `loadingStateChanged` here — this emit is the
      // negative control, so the payload stands in for the full event shape.
      fake.emit("loadingStateChanged", {
        isLoading: true,
      } as I18nEventData["loadingStateChanged"]);
    });
    expect(firedCount).toBe(2);

    unsubscribe();
    await act(async () => {
      fake.emit("localeChanged", { from: "fr", to: "de" });
    });
    expect(firedCount).toBe(2);
  });

  /** Renders `useSubscribe` and hands back the subscribe function it produced. */
  const captureSubscribe = (fake: FakeI18n, ...events: I18nEvent[]) => {
    const box: { current: ((cb: () => void) => () => void) | null } = { current: null };

    function Driver() {
      const sub = useSubscribe(fake.asI18n(), ...events);
      useEffect(() => {
        box.current = sub;
      }, [sub]);
      return null;
    }

    render(<Driver />);

    if (!box.current) {
      throw new Error("useSubscribe produced no subscribe function");
    }
    return box.current;
  };

  // The callback is deferred out of core's synchronous `_emit` stack, so an
  // event can land while the subscription is still live and only reach the
  // callback after it has been torn down.
  it("ignores an event emitted before unsubscribe once the deferral runs", async () => {
    const fake = new FakeI18n();
    const subscribe = captureSubscribe(fake, "localeChanged");
    const callback = vi.fn();

    const unsubscribe = subscribe(callback);
    fake.emit("localeChanged", { from: "en", to: "fr" });
    unsubscribe();
    await act(async () => {
      await Promise.resolve();
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("removes its host listeners on unsubscribe", () => {
    const fake = new FakeI18n();
    const subscribe = captureSubscribe(fake, "localeChanged", "initialized");

    const unsubscribe = subscribe(() => {});
    const whileSubscribed = fake.listenerCount("localeChanged");
    unsubscribe();

    expect(whileSubscribed).toBe(1);
    expect(fake.listenerCount("localeChanged")).toBe(0);
    expect(fake.listenerCount("initialized")).toBe(0);
  });
});
