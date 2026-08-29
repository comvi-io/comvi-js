import { beforeEach, afterEach } from "vitest";

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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();

  mockCookie("");
  mockWindowLocation();
  mockNavigator();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

export { MockStorage };
