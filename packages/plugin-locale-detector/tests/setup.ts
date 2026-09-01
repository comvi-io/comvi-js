import { beforeEach, afterEach } from "vitest";

type StubbedGlobal = readonly [holder: () => object, property: string];

/**
 * Every browser property these helpers redefine, so `afterEach` can put the
 * original descriptor back instead of leaving the stub in place for whatever
 * runs next in the worker.
 */
const STUBBED: StubbedGlobal[] = [
  [() => globalThis.navigator, "languages"],
  [() => globalThis.navigator, "language"],
  [() => globalThis.document, "cookie"],
  [() => globalThis.window, "location"],
];

const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();

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

/** Older/embedded browsers expose `navigator.language` but no `languages` array at all. */
export function mockNavigatorWithoutLanguages(language: string) {
  Object.defineProperty(globalThis.navigator, "languages", {
    value: undefined,
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

type BrowserGlobal = "window" | "document" | "navigator";

/**
 * Runs `run` with `window`/`document`/`navigator` absent, restoring the exact
 * descriptors afterwards — the SSR-shaped environment the detector must survive.
 */
export async function withDisabledBrowserGlobals(run: () => Promise<void> | void): Promise<void> {
  const keys: BrowserGlobal[] = ["window", "document", "navigator"];
  const descriptors = new Map<BrowserGlobal, PropertyDescriptor | undefined>(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );

  for (const key of keys) {
    Object.defineProperty(globalThis, key, {
      value: undefined,
      configurable: true,
      writable: true,
    });
  }

  try {
    await run();
  } finally {
    for (const key of keys) {
      const descriptor = descriptors.get(key);
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
  }
}

beforeEach(() => {
  for (const [holder, property] of STUBBED) {
    const id = `${property}`;
    if (!originalDescriptors.has(id)) {
      originalDescriptors.set(id, Object.getOwnPropertyDescriptor(holder(), property));
    }
  }

  localStorage.clear();
  sessionStorage.clear();

  mockCookie("");
  mockWindowLocation();
  mockNavigator();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();

  for (const [holder, property] of STUBBED) {
    const descriptor = originalDescriptors.get(`${property}`);
    if (descriptor) {
      Object.defineProperty(holder(), property, descriptor);
    } else {
      Reflect.deleteProperty(holder(), property);
    }
  }
});
