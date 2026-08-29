import { beforeEach, expect, vi } from "vitest";
import { installIntersectionObserverMock } from "./intersectionObserverMock";

// happy-dom's IntersectionObserver never fires; install a controllable double
// so the collector's IO-driven visibility set works in tests. Default behavior
// reports observed elements as intersecting (see intersectionObserverMock.ts).
installIntersectionObserverMock();

// `resolveBaseUrl()` reads `import.meta.env.VITE_API_BASE_URL` every time
// `initApiConfig()` runs, so service tests can assert outgoing fetch URLs only
// while it is pinned. This must be a hook, not a module-scope call: the suite's
// `unstubEnvs` clears env stubs after every test, and setup-file hooks run
// after Vitest's own `unstubAllEnvs`.
beforeEach(() => {
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
});

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

expect.extend({
  toContainInvisibleChars(received: string) {
    const invisibleChars = ["\u200B", "\u200D", "\u200C", "\u2063", "\u2064"];
    const hasInvisible = invisibleChars.some((char) => received.includes(char));

    return {
      pass: hasInvisible,
      message: () =>
        hasInvisible
          ? `Expected string not to contain invisible characters`
          : `Expected string to contain invisible characters`,
    };
  },
});

declare global {
  // Vitest's documented way to add custom matcher types is namespace augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    interface Matchers<R = unknown> {
      toContainInvisibleChars(): R;
    }
  }
}
