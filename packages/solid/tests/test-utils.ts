import { afterEach } from "vitest";
import { createRoot } from "solid-js";
import { render } from "solid-js/web";
import type { JSX } from "solid-js";

const disposers: Array<() => void> = [];

// Solid's unit tests get no auto-cleanup (they drive `solid-js/web`'s `render`
// directly), so a disposer written as the last statement of a test body is
// skipped by any assertion that fails above it — and the leaked root keeps its
// `i18n.on(...)` subscriptions live into every following test.
afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()!();
  }
});

/** Renders into a detached container; the disposer runs in `afterEach`. */
export const renderSolid = (ui: () => JSX.Element): HTMLDivElement => {
  const container = document.createElement("div");
  disposers.push(render(ui, container));
  return container;
};

/** `createRoot` whose disposer runs in `afterEach`. Synchronous: an `async`
 *  root callback loses the reactive owner after its first `await`. */
export const createTestRoot = <T>(build: () => T): T =>
  createRoot((dispose) => {
    disposers.push(dispose);
    return build();
  });

/**
 * The package's ONE deterministic flush. `turns` is the number of microtask
 * turns the code under test needs to settle — a stated fact rather than a
 * copy-pasted `await Promise.resolve()` chain whose count nobody can justify.
 */
export const flushMicrotasks = async (turns = 1) => {
  for (let i = 0; i < turns; i += 1) {
    await Promise.resolve();
  }
};
