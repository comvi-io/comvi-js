/**
 * `useStoreRevision` is the wrapper's bridge from core's revision events to
 * React. What it owes callers: a subscription that follows the instance it is
 * given, releases itself on unmount, and a revision that changes whenever any
 * axis of the store does.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStoreRevision } from "../src/I18nProvider";
import { FakeI18n } from "@comvi/test-utils/fakeI18n";

// Only `useStoreRevision` subscribes to it — the provider's own event lists do
// not — so it isolates this hook's listeners.
const REVISION_ONLY_EVENT = "namespaceLoaded";

describe("useStoreRevision", () => {
  it("releases its revision listeners on unmount", () => {
    const fake = new FakeI18n();

    const { unmount } = renderHook(() => useStoreRevision(fake.asI18n()));
    const whileMounted = fake.listenerCount(REVISION_ONLY_EVENT);
    unmount();

    expect(whileMounted).toBe(1);
    expect(fake.listenerCount(REVISION_ONLY_EVENT)).toBe(0);
  });

  it("moves its subscription to the new instance when the i18n argument changes", () => {
    const first = new FakeI18n();
    const second = new FakeI18n();

    const { rerender } = renderHook(
      ({ i18n }: { i18n: FakeI18n }) => useStoreRevision(i18n.asI18n()),
      {
        initialProps: { i18n: first },
      },
    );
    rerender({ i18n: second });

    expect(first.listenerCount(REVISION_ONLY_EVENT)).toBe(0);
    expect(second.listenerCount(REVISION_ONLY_EVENT)).toBe(1);
  });

  it("reads the revision from the new instance after the i18n argument changes", async () => {
    const first = new FakeI18n();
    const second = new FakeI18n();

    const { result, rerender } = renderHook(
      ({ i18n }: { i18n: FakeI18n }) => useStoreRevision(i18n.asI18n()),
      { initialProps: { i18n: first } },
    );
    rerender({ i18n: second });
    const before = result.current;

    await act(async () => {
      await second.addActiveNamespace("admin");
    });

    expect(result.current).not.toBe(before);
  });

  it("produces a new revision when the locale changes", async () => {
    const fake = new FakeI18n();

    const { result } = renderHook(() => useStoreRevision(fake.asI18n()));
    const before = result.current;

    await act(async () => {
      fake.language = "fr";
      fake.emit("localeChanged", { from: "en", to: "fr" });
    });

    expect(result.current).not.toBe(before);
  });

  // "a" + "b" and "ab" concatenate identically: without a separator between the
  // entries these two different chains would share one revision.
  it("produces a new revision when the fallback chain is re-split", async () => {
    const fake = new FakeI18n();
    fake.setFallbackLocale(["a", "b"]);

    const { result } = renderHook(() => useStoreRevision(fake.asI18n()));
    const before = result.current;

    await act(async () => {
      fake.setFallbackLocale(["ab"]);
      fake.emit("configChanged", { source: "fallbackLocale" });
    });

    expect(result.current).not.toBe(before);
  });

  it("produces a new revision when the active namespaces change", async () => {
    const fake = new FakeI18n();

    const { result } = renderHook(() => useStoreRevision(fake.asI18n()));
    const before = result.current;

    await act(async () => {
      await fake.addActiveNamespace("admin");
    });

    expect(result.current).not.toBe(before);
  });
});
