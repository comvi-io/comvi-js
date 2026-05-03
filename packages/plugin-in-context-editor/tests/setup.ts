/**
 * Vitest setup file - runs before all tests
 */

// Extend matchers if needed
import { expect, vi } from "vitest";

// The plugin reads `import.meta.env.VITE_API_BASE_URL` at build time. Pin it
// to a known host so service tests can assert outgoing fetch URLs.
vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");

// Global test utilities
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.matchMedia for responsive tests
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

// Add custom matchers if needed
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
