import { vi } from "vitest";

/**
 * Shared harness for the "no render-time update" regression family
 * (`next-hydration`, `next-provider-no-render-warning`,
 * `next-provider-suspense-oqa`). `next-hydration.test.tsx` carries the positive
 * control that proves this harness can observe a warning at all — without it
 * every `not.toHaveBeenCalled()` in the family could pass on a mis-wired spy.
 */
export const RENDER_WARNING = "Cannot update a component";

type ConsoleSpy = { mock: { calls: unknown[][] } };

/** `restoreMocks` in vitest.config.ts restores the spy after each test. */
export const spyOnConsoleError = () => vi.spyOn(console, "error").mockImplementation(() => {});

export const renderWarnings = (spy: ConsoleSpy): unknown[][] =>
  spy.mock.calls.filter((args) => typeof args[0] === "string" && args[0].includes(RENDER_WARNING));

/**
 * Drains the queueMicrotask deferral React schedules updates through. Two ticks,
 * because the deferred callback may itself queue the state update. Not a sleep:
 * no timer is involved and nothing races.
 */
export const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
