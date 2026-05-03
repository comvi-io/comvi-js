import { beforeEach, afterEach } from "vitest";

// Mock storage for testing
class MockStorage implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

// Mock navigator for language detection
export function mockNavigator(languages: string[] = ["en-US", "en"], language: string = "en-US") {
  Object.defineProperty(globalThis.navigator, "languages", {
    value: languages,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis.navigator, "language", {
    value: language,
    writable: true,
    configurable: true,
  });
}

// Mock document.cookie
export function mockCookie(value: string = "") {
  let cookieValue = value;

  Object.defineProperty(globalThis.document, "cookie", {
    get() {
      return cookieValue;
    },
    set(newValue: string) {
      cookieValue = newValue;
    },
    configurable: true,
  });
}

// Mock URL search params
export function mockWindowLocation(search: string = "") {
  Object.defineProperty(globalThis.window, "location", {
    value: {
      search,
      href: `http://localhost${search}`,
      origin: "http://localhost",
      protocol: "http:",
      host: "localhost",
      hostname: "localhost",
      port: "",
      pathname: "/",
      hash: "",
    },
    writable: true,
    configurable: true,
  });
}

// Reset all mocks before each test
beforeEach(() => {
  // Clear storages
  localStorage.clear();
  sessionStorage.clear();

  // Reset cookies
  mockCookie("");

  // Reset location
  mockWindowLocation();

  // Reset navigator
  mockNavigator();
});

// Clean up after each test
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

export { MockStorage };
