/**
 * The editor loader the devtools capability installs for the Comvi browser
 * extension — protocol 1 of `contracts/chrome-extension-proxy.json#editorLoader`.
 *
 * The extension carries no editor. It calls a slot on `globalThis`, and the
 * code under test — shipped by the site — loads the standalone editor from
 * jsDelivr. What is pinned here is therefore a wire contract and a trust
 * boundary: which URL may ever be requested, what the slot looks like to every
 * editor that will ever read it, and that nothing a page plants in the slot can
 * break construction.
 *
 * happy-dom does not fetch a `<script src>`: it settles the element
 * synchronously, inside `appendChild` (as a `load` under the setting chosen
 * below — the default is an `error` plus a logged exception). `holdScripts()`
 * therefore inserts the element with its handlers detached: the script is
 * really in the document and stays pending until a test fires `load` or
 * `error` itself.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createI18n } from "../../src";
import { I18n as CompositeI18n } from "../../src/core/full";
import { attachDevtools, devtools } from "../../src/devtools";
import type { EditorLoadResult, EditorLoaderSlot } from "../../src/devtools";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pkg from "../../package.json";

const LOADER_KEY = Symbol.for("comvi.devtools.editorLoader");
const LOAD_KEY = Symbol.for("comvi.devtools.editorLoad");
const LATEST_URL =
  "https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js";
const HOUR = 3_600_000;
// Resolved at run time: the fixture is plain JS in another package, outside
// this project's type roots.
const PROTOCOL_1_FIXTURE = pathToFileURL(
  resolve(
    __dirname,
    "../../../plugin-in-context-editor/tests/fixtures/editor-loader-hooks/protocol-1.js",
  ),
).href;

const slots = globalThis as unknown as Record<symbol, unknown>;
const win = window as { ComviInContextEditor?: unknown };
const happyDOMSettings = (
  window as unknown as { happyDOM: { settings: { handleDisabledFileLoadingAsSuccess: boolean } } }
).happyDOM.settings;

const liveSlot = (): EditorLoaderSlot => slots[LOADER_KEY] as EditorLoaderSlot;
const scripts = (): HTMLScriptElement[] => Array.from(document.querySelectorAll("script"));

/** Compose devtools on a fresh base instance and return the page's slot. */
function install(editorVersion?: string): EditorLoaderSlot {
  createI18n({ locale: "en" }).use(devtools({ editorVersion }));
  return liveSlot();
}

/** Insert scripts for real, minus happy-dom's own synchronous `load`. */
function holdScripts(): void {
  const root = document.documentElement;
  const append = root.appendChild.bind(root);
  vi.spyOn(root, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
    const script = node as unknown as HTMLScriptElement;
    const { onload, onerror } = script;
    script.onload = script.onerror = null;
    append(node);
    script.onload = onload;
    script.onerror = onerror;
    return node;
  });
}

function violation(
  blockedURI: string,
  effectiveDirective: string,
  disposition: "enforce" | "report" = "enforce",
): void {
  document.dispatchEvent(
    Object.assign(new Event("securitypolicyviolation"), {
      blockedURI,
      effectiveDirective,
      disposition,
    }),
  );
}

function resetPage(): void {
  delete slots[LOADER_KEY];
  delete slots[LOAD_KEY];
  delete win.ComviInContextEditor;
  for (const script of scripts()) script.remove();
}

beforeEach(() => {
  resetPage();
  happyDOMSettings.handleDisabledFileLoadingAsSuccess = true;
  holdScripts();
});

afterEach(() => {
  happyDOMSettings.handleDisabledFileLoadingAsSuccess = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPage();
});

describe("slot installation", () => {
  it("devtools() in a browser → installs the protocol-1 slot on globalThis", () => {
    createI18n({ locale: "en" }).use(devtools());

    expect(liveSlot()).toEqual({
      protocol: 1,
      sdkVersion: pkg.version,
      editorVersion: "latest",
      url: LATEST_URL,
      load: expect.any(Function),
    });
  });

  it("attachDevtools() → installs the same slot", () => {
    attachDevtools(createI18n({ locale: "en" }));

    expect(liveSlot().url).toBe(LATEST_URL);
  });

  it("the composite → installs the slot and loads latest", () => {
    new CompositeI18n({ locale: "en" });

    expect(liveSlot()).toMatchObject({ protocol: 1, editorVersion: "latest", url: LATEST_URL });
  });

  it("installing the slot → touches no DOM", () => {
    const createElement = vi.spyOn(document, "createElement");
    const addEventListener = vi.spyOn(document, "addEventListener");

    install();

    expect(createElement).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(scripts()).toHaveLength(0);
  });

  it("exposeGlobal: false → installs no slot", () => {
    createI18n({ locale: "en" }).use(devtools({ exposeGlobal: false }));

    expect(LOADER_KEY in slots).toBe(false);
  });

  it("no window → installs no slot", () => {
    vi.stubGlobal("window", undefined);

    createI18n({ locale: "en" }).use(devtools());

    expect(LOADER_KEY in slots).toBe(false);
  });

  it("no window with exposeGlobal: true → assigns the id but installs no slot", () => {
    vi.stubGlobal("window", undefined);

    const i18n = createI18n({ locale: "en" }).use(devtools({ exposeGlobal: true }));

    expect(i18n.instanceId).toBeDefined();
    expect(LOADER_KEY in slots).toBe(false);
  });

  it("a base instance → installs no slot", async () => {
    const i18n = createI18n({ locale: "en" });
    await i18n.init();

    expect(LOADER_KEY in slots).toBe(false);
  });

  it("composing devtools → adds instanceId and no other public own key to the instance", () => {
    const publicKeys = (value: object): string[] =>
      Object.keys(value).filter((key) => !key.startsWith("_"));
    const baseKeys = publicKeys(createI18n({ locale: "en" }));

    const i18n = createI18n({ locale: "en" }).use(devtools());

    expect(publicKeys(i18n)).toEqual([...baseKeys, "instanceId"]);
  });

  it("destroy() → leaves the page-level slot in place", async () => {
    const i18n = createI18n({ locale: "en" }).use(devtools());
    const slot = liveSlot();

    await i18n.destroy();

    expect(liveSlot()).toBe(slot);
  });
});

describe("editorVersion", () => {
  it.each(["0.5.3", "1.20.300", "0.6.0-rc.1", "0.6.0-next.2-x"])(
    "exact version %s → pinned in the URL",
    (version) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const slot = install(version);

      expect(slot.editorVersion).toBe(version);
      expect(slot.url).toBe(
        `https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@${version}/dist/standalone.iife.js`,
      );
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('"latest" → latest, without a warning', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const slot = install("latest");

    expect(slot).toMatchObject({ editorVersion: "latest", url: LATEST_URL });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    "../evil",
    "0.5.3?x",
    "",
    "0.5",
    "^0.5.3",
    "0.5.3/../../evil",
    "0.5.3#x",
    "0.5.3@evil.example",
    "0.5.3-rc 1",
    "0.5.3\n",
    "x0.5.3",
    "next",
    // URL metacharacters inside the prerelease part: the character class is
    // what keeps them out of the path.
    "0.5.3-a/b",
    "0.5.3-a/../../../gh/evil/repo",
    "0.5.3-a?b",
    "0.5.3-a#b",
    "0.5.3-a%2fb",
    "0.5.3-a@b",
    "0.5.3-a b",
    "0.5.3-a\tb",
    "0.5.3-a\nb",
    "0.5.3-a\\b",
    "0.5.3-a:b",
    "0.5.3-",
  ])(
    "invalid version %j → fails closed: no URL, load() requests nothing, one development warning",
    async (version) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const slot = install(version);
      const result = await slot.load();

      expect(slot).toMatchObject({ protocol: 1, editorVersion: "invalid", url: "" });
      expect(result).toMatchObject({ ok: false, code: "invalid-editor-version", url: "" });
      expect(scripts()).toHaveLength(0);
      expect(slots[LOAD_KEY]).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("will not load the editor");
      expect(warn.mock.calls[0][0]).not.toContain("latest");
    },
  );

  it("invalid version with the editor already on the page → still requests nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    win.ComviInContextEditor = { activate: () => {}, version: "0.6.0" };

    const result = await install("next").load();

    expect(result).toMatchObject({ ok: false, code: "invalid-editor-version" });
    expect(scripts()).toHaveLength(0);
  });

  it("invalid version → every load() call answers the same failure, never cached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const slot = install("0.5");

    const [a, b] = await Promise.all([slot.load(), slot.load()]);

    expect(a).toEqual(b);
    expect(a.code).toBe("invalid-editor-version");
    expect(slots[LOAD_KEY]).toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });

  it("dots in the prerelease part → accepted, and the URL stays inside the editor package", () => {
    // `..` is legal there under the contract's pattern. It is not a path
    // segment of its own, so URL normalisation leaves the path alone.
    const slot = install("0.5.3-..");

    expect(slot.editorVersion).toBe("0.5.3-..");
    expect(new URL(slot.url).href).toBe(
      "https://cdn.jsdelivr.net/npm/@comvi/plugin-in-context-editor@0.5.3-../dist/standalone.iife.js",
    );
  });

  /** Prints a valid version the first time it is coerced and a path escape after that. */
  const stateful = (method: "toString" | "valueOf"): object => {
    let calls = 0;
    const print = (): string =>
      calls++ === 0 ? "0.5.3" : "0.0.0/../../../../gh/attacker/repo/evil.js";
    return method === "toString" ? { toString: print } : { valueOf: print, toString: undefined };
  };

  it.each([
    ["an object with a stateful toString", stateful("toString")],
    ["an object with a stateful valueOf", stateful("valueOf")],
    ["an object whose toString prints a valid version", { toString: () => "0.5.3" }],
    ["a String object", new String("0.5.3")],
    ["a number", 5],
    ["an array", ["0.5.3"]],
    ["null", null],
    ["a boolean", true],
  ])(
    "%s as editorVersion → fails closed, a string in the slot, nothing requested",
    async (_l, pin) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const slot = install(pin as never);
      const result = await slot.load();

      expect(slot.editorVersion).toBe("invalid");
      expect(slot.url).toBe("");
      expect(result.code).toBe("invalid-editor-version");
      expect(scripts()).toHaveLength(0);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it("an options object whose editorVersion getter throws → construction survives, no slot", () => {
    const options = Object.create({
      get editorVersion(): string {
        throw new Error("hostile");
      },
    }) as { instanceId?: string };
    options.instanceId = "survivor";

    const i18n = createI18n({ locale: "en" }).use(devtools(options));

    expect(i18n.instanceId).toBe("survivor");
    expect(window.__COMVI__).toEqual([expect.objectContaining({ i: i18n })]);
    expect(LOADER_KEY in slots).toBe(false);
  });

  it("editorVersion → read off the options exactly once", () => {
    let reads = 0;
    const options = {
      get editorVersion(): string {
        return reads++ === 0 ? "0.5.3" : "9.9.9";
      },
    };

    createI18n({ locale: "en" }).use(devtools(options));

    expect(reads).toBe(1);
    expect(liveSlot().url).toContain("@0.5.3/");
  });
});

describe("load()", () => {
  it("first call → creates exactly one anonymous-CORS script in the document", () => {
    const slot = install("0.5.3");

    void slot.load();

    const [script, ...rest] = scripts();
    expect(rest).toHaveLength(0);
    expect(script.parentNode).toBe(document.documentElement);
    expect(script.getAttribute("crossorigin")).toBe("anonymous");
    expect(script.hasAttribute("integrity")).toBe(false);
  });

  it("exact pin → requests the URL with no query string", () => {
    const slot = install("0.5.3");

    void slot.load();

    expect(scripts()[0].src).toBe(slot.url);
    expect(slot.url).not.toContain("?");
  });

  it("latest → requests the URL with the hour bucket as cache salt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(497_694 * HOUR + 1234);
    const slot = install();

    void slot.load();

    expect(scripts()[0].src).toBe(`${LATEST_URL}?comvi=497694`);
    expect(slot.url).toBe(LATEST_URL);
  });

  it("latest, two failed loads within one hour → the same salt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10 * HOUR);
    const slot = install();

    const first = slot.load();
    const firstSrc = scripts()[0].src;
    scripts()[0].dispatchEvent(new Event("error"));
    await first;
    vi.setSystemTime(11 * HOUR - 1);
    void slot.load();

    expect(firstSrc).toBe(`${LATEST_URL}?comvi=10`);
    expect(scripts()[0].src).toBe(firstSrc);
  });

  it("latest, a fresh load in the next hour → a new salt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10 * HOUR);
    const slot = install();

    const first = slot.load();
    scripts()[0].dispatchEvent(new Event("error"));
    await first;
    vi.setSystemTime(11 * HOUR);
    void slot.load();

    expect(scripts()[0].src).toBe(`${LATEST_URL}?comvi=11`);
  });

  it("second call while pending → the same promise and still one script", () => {
    const slot = install();

    const first = slot.load();
    const second = slot.load();

    expect(second).toBe(first);
    expect(scripts()).toHaveLength(1);
  });

  it("script loads and defines the editor → ok with the editor's version", async () => {
    const slot = install("0.5.3");
    const promise = slot.load();

    win.ComviInContextEditor = { activate: () => {}, version: "0.5.3" };
    scripts()[0].dispatchEvent(new Event("load"));

    await expect(promise).resolves.toEqual({
      ok: true,
      url: slot.url,
      sdkVersion: pkg.version,
      protocol: 1,
      editorVersion: "0.5.3",
    });
  });

  it("an editor older than 0.6.0 (no version member) → ok with editorVersion undefined", async () => {
    const slot = install();
    const promise = slot.load();

    win.ComviInContextEditor = { activate: () => {} };
    scripts()[0].dispatchEvent(new Event("load"));

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.editorVersion).toBeUndefined();
  });

  it("after a successful load → later calls return the same promise, no second script", async () => {
    const slot = install();
    const first = slot.load();
    win.ComviInContextEditor = { activate: () => {} };
    scripts()[0].dispatchEvent(new Event("load"));
    const result = await first;

    const again = slot.load();

    expect(again).toBe(first);
    expect(result.url).toBe(scripts()[0].src);
    expect(scripts()).toHaveLength(1);
  });

  it("after a successful load → the script stays, with its handlers detached", async () => {
    const promise = install().load();
    const script = scripts()[0];
    win.ComviInContextEditor = { activate: () => {} };

    script.dispatchEvent(new Event("load"));
    await promise;

    expect(script.isConnected).toBe(true);
    expect(script.onload).toBeNull();
    expect(script.onerror).toBeNull();
  });

  it("editor injected by someone else while a load is pending → still the pending promise", () => {
    const slot = install();
    const first = slot.load();

    win.ComviInContextEditor = { activate: () => {} };

    expect(slot.load()).toBe(first);
  });

  it("editor global already on the page → ok at once, no script, salt-free url", async () => {
    win.ComviInContextEditor = { activate: () => {}, version: "0.5.0" };
    const slot = install();

    const result = await slot.load();

    expect(result).toEqual({
      ok: true,
      url: LATEST_URL,
      sdkVersion: pkg.version,
      protocol: 1,
      editorVersion: "0.5.0",
    });
    expect(scripts()).toHaveLength(0);
  });

  it("detached from the slot → still loads", () => {
    const { load } = install();

    void load();

    expect(scripts()).toHaveLength(1);
  });
});

describe("load() failures", () => {
  it("CSP violation for the editor URL, then error → csp-blocked naming the CDN host", async () => {
    const slot = install();
    const promise = slot.load();
    const src = scripts()[0].src;

    violation(src, "script-src-elem");
    scripts()[0].dispatchEvent(new Event("error"));

    await expect(promise).resolves.toEqual({
      ok: false,
      url: src,
      sdkVersion: pkg.version,
      protocol: 1,
      code: "csp-blocked",
      host: "cdn.jsdelivr.net",
    });
  });

  it.each(["script-src", "script-src-elem"])(
    "CSP violation reported as the CDN origin under %s → csp-blocked",
    async (directive) => {
      const promise = install().load();

      violation("https://cdn.jsdelivr.net", directive);
      scripts()[0].dispatchEvent(new Event("error"));

      expect((await promise).code).toBe("csp-blocked");
    },
  );

  it.each([
    [
      "another script on the CDN",
      "https://cdn.jsdelivr.net/npm/other@1.0.0/x.js",
      "script-src-elem",
    ],
    ["the CDN origin under another directive", "https://cdn.jsdelivr.net", "img-src"],
    ["the CDN origin under script-src-attr", "https://cdn.jsdelivr.net", "script-src-attr"],
    ["another origin", "https://evil.example", "script-src-elem"],
    ["a look-alike origin", "https://cdn.jsdelivr.net.evil.example", "script-src"],
    ["the editor URL under an unrelated directive", LATEST_URL, "img-src"],
    ["the editor URL under script-src-attr", LATEST_URL, "script-src-attr"],
    ["the editor URL under the Trusted Types directive", LATEST_URL, "require-trusted-types-for"],
  ])("CSP violation for %s, then error → load-error", async (_label, uri, directive) => {
    const promise = install().load();

    violation(uri, directive);
    scripts()[0].dispatchEvent(new Event("error"));

    expect((await promise).code).toBe("load-error");
  });

  it.each([
    ["the editor URL", LATEST_URL],
    ["the CDN origin", "https://cdn.jsdelivr.net"],
  ])("report-only violation for %s, then a network error → load-error", async (_label, uri) => {
    const promise = install().load();

    violation(uri, "script-src-elem", "report");
    scripts()[0].dispatchEvent(new Event("error"));

    expect((await promise).code).toBe("load-error");
  });

  it("report-only violation, then the script loads → ok", async () => {
    const promise = install().load();

    violation(scripts()[0].src, "script-src-elem", "report");
    win.ComviInContextEditor = { activate: () => {} };
    scripts()[0].dispatchEvent(new Event("load"));

    expect((await promise).ok).toBe(true);
  });

  it("a script-src violation with no disposition (an older engine) → taken as enforced", async () => {
    const promise = install().load();

    document.dispatchEvent(
      Object.assign(new Event("securitypolicyviolation"), {
        blockedURI: scripts()[0].src,
        effectiveDirective: "script-src-elem",
      }),
    );
    scripts()[0].dispatchEvent(new Event("error"));

    expect((await promise).code).toBe("csp-blocked");
  });

  it.each([
    [
      "the root element refuses the insertion",
      (): void => {
        vi.mocked(document.documentElement.appendChild).mockImplementation(() => {
          throw new DOMException("HierarchyRequestError");
        });
      },
    ],
    [
      "the document has no root element",
      (): void => {
        vi.spyOn(document, "documentElement", "get").mockReturnValue(null as never);
      },
    ],
  ])("%s → load-error, not a policy block, nothing left behind", async (_label, arrange) => {
    vi.useFakeTimers();
    arrange();
    const slot = install();

    const result = await slot.load();

    expect(result).toMatchObject({ ok: false, code: "load-error" });
    expect(slots[LOAD_KEY]).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Trusted Types refuses the src assignment → csp-blocked, nothing left behind", async () => {
    vi.useFakeTimers();
    const removeListener = vi.spyOn(document, "removeEventListener");
    const createElement = document.createElement.bind(document);
    let created: HTMLScriptElement | undefined;
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      created = createElement(tag) as HTMLScriptElement;
      Object.defineProperty(created, "src", {
        set() {
          throw new TypeError("This document requires 'TrustedScriptURL' assignment.");
        },
      });
      return created;
    });
    const slot = install();

    const result = await slot.load();

    expect(result).toMatchObject({ ok: false, code: "csp-blocked", host: "cdn.jsdelivr.net" });
    expect(created!.isConnected).toBe(false);
    expect(slots[LOAD_KEY]).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("securitypolicyviolation", expect.any(Function));
  });

  it("a malformed securitypolicyviolation event → ignored, the load carries on", async () => {
    const promise = install().load();

    document.dispatchEvent(new Event("securitypolicyviolation"));
    scripts()[0].dispatchEvent(new Event("error"));

    expect((await promise).code).toBe("load-error");
  });

  it("error with no CSP violation → load-error naming the CDN host", async () => {
    const slot = install("9.9.9");
    const promise = slot.load();

    scripts()[0].dispatchEvent(new Event("error"));

    await expect(promise).resolves.toEqual({
      ok: false,
      url: slot.url,
      sdkVersion: pkg.version,
      protocol: 1,
      code: "load-error",
      host: "cdn.jsdelivr.net",
    });
  });

  it("neither load nor error for 10 s → timeout, and the script element is removed", async () => {
    vi.useFakeTimers();
    const promise = install().load();
    let settled = false;
    void promise.then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(9_999);
    const before = { settled, scripts: scripts().length };
    await vi.advanceTimersByTimeAsync(1);

    expect(before).toEqual({ settled: false, scripts: 1 });
    expect((await promise).code).toBe("timeout");
    expect(scripts()).toHaveLength(0);
  });

  it("load arriving after the timeout → does not resurrect the settled result", async () => {
    vi.useFakeTimers();
    const promise = install().load();
    const script = scripts()[0];
    await vi.advanceTimersByTimeAsync(10_000);

    win.ComviInContextEditor = { activate: () => {} };
    script.dispatchEvent(new Event("load"));

    expect((await promise).code).toBe("timeout");
  });

  it("a stale script firing after a newer attempt started → leaves the newer attempt alone", async () => {
    vi.useFakeTimers();
    const slot = install();
    const first = slot.load();
    const stale = scripts()[0];
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
    const second = slot.load();

    const detached = [stale.onload, stale.onerror];
    stale.dispatchEvent(new Event("error"));
    stale.dispatchEvent(new Event("load"));

    expect(detached).toEqual([null, null]);
    expect(slots[LOAD_KEY]).toBe(second);
    expect(slot.load()).toBe(second);
    expect(scripts()).toHaveLength(1);
  });

  it("the load key was replaced during a load that then fails → the replacement is left in place", async () => {
    const promise = install().load();
    const foreign = Promise.resolve();
    slots[LOAD_KEY] = foreign;

    scripts()[0].dispatchEvent(new Event("error"));
    await promise;

    expect(slots[LOAD_KEY]).toBe(foreign);
  });

  it("the load key turns read-only during a load → the promise still settles, the script is removed", async () => {
    vi.useFakeTimers();
    const promise = install().load();
    Object.defineProperty(slots, LOAD_KEY, { configurable: true, writable: false, value: promise });
    let result: EditorLoadResult | undefined;
    void promise.then((value) => (result = value));

    scripts()[0].dispatchEvent(new Event("error"));
    await vi.advanceTimersByTimeAsync(0);

    expect(result).toMatchObject({ ok: false, code: "load-error" });
    expect(scripts()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the load key is read-only before the load → resolves load-error, never throws", async () => {
    Object.defineProperty(slots, LOAD_KEY, {
      configurable: true,
      writable: false,
      value: undefined,
    });
    const slot = install();

    const result = await slot.load();

    expect(result).toMatchObject({ ok: false, code: "load-error" });
    expect(scripts()).toHaveLength(0);
  });

  it("a settled load → leaves no timer and no CSP listener behind", async () => {
    vi.useFakeTimers();
    const removeListener = vi.spyOn(document, "removeEventListener");
    const promise = install().load();

    scripts()[0].dispatchEvent(new Event("error"));
    await promise;

    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("securitypolicyviolation", expect.any(Function));
  });

  it("load fires but no editor global appears → no-global", async () => {
    const promise = install().load();

    scripts()[0].dispatchEvent(new Event("load"));

    expect((await promise).code).toBe("no-global");
    expect(scripts()).toHaveLength(0);
  });

  it.each([
    ["an object without activate()", { version: "0.6.0" }],
    ["an object whose activate is not a function", { activate: true }],
    ["a string", "editor"],
  ])("load fires and the global is %s → no-global", async (_label, planted) => {
    const promise = install().load();

    win.ComviInContextEditor = planted;
    scripts()[0].dispatchEvent(new Event("load"));

    expect((await promise).code).toBe("no-global");
  });

  it("a failed load is not cached → the next load() creates a fresh script", async () => {
    const slot = install();
    const first = slot.load();
    const firstScript = scripts()[0];
    firstScript.dispatchEvent(new Event("error"));
    await first;

    const second = slot.load();

    expect(second).not.toBe(first);
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).not.toBe(firstScript);
    expect(slots[LOAD_KEY]).toBe(second);
  });

  it("a script that settles synchronously on insertion → the failure is still not cached", async () => {
    // happy-dom's own behaviour, unmasked: `load` fires inside appendChild,
    // before load() has stored its promise.
    vi.mocked(document.documentElement.appendChild).mockRestore();
    const slot = install();

    const result = await slot.load();

    expect(result.code).toBe("no-global");
    expect(slots[LOAD_KEY]).toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });

  it("a page that refuses to create the script → resolves load-error, never rejects", async () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new TypeError("Trusted Types");
    });
    const slot = install();

    const result = await slot.load();

    expect(result).toMatchObject({ ok: false, code: "load-error", host: "cdn.jsdelivr.net" });
    expect(slots[LOAD_KEY]).toBeUndefined();
  });
});

describe("what the hook reads off window.ComviInContextEditor", () => {
  /** An editor global that records every way it is inspected. */
  function recordingEditor(): { editor: object; touched: string[] } {
    const touched: string[] = [];
    const note =
      (trap: string) =>
      (_target: object, key?: string | symbol): never => {
        touched.push(`${trap}:${String(key)}`);
        throw new Error(`unexpected ${trap}`);
      };
    const editor = new Proxy(
      { activate: () => {}, version: "0.6.0", deactivate: () => {}, getStatus: () => ({}) },
      {
        get(target, key, receiver) {
          touched.push(String(key));
          return Reflect.get(target, key, receiver);
        },
        has: note("has"),
        ownKeys: note("ownKeys"),
        getOwnPropertyDescriptor: note("getOwnPropertyDescriptor"),
        set: note("set"),
        defineProperty: note("defineProperty"),
        deleteProperty: note("deleteProperty"),
        getPrototypeOf: note("getPrototypeOf"),
      },
    );
    return { editor, touched };
  }

  it("already-loaded path → reads activate and version only", async () => {
    const { editor, touched } = recordingEditor();
    win.ComviInContextEditor = editor;

    const result = await install().load();

    expect(result).toMatchObject({ ok: true, editorVersion: "0.6.0" });
    expect(touched).toEqual(["activate", "version"]);
  });

  it("after-load path → reads activate and version only", async () => {
    const { editor, touched } = recordingEditor();
    const promise = install().load();

    win.ComviInContextEditor = editor;
    scripts()[0].dispatchEvent(new Event("load"));

    expect(await promise).toMatchObject({ ok: true, editorVersion: "0.6.0" });
    expect(touched).toEqual(["activate", "version"]);
  });

  it("an editor global whose members throw → treated as missing, load() does not throw", async () => {
    Object.defineProperty(win, "ComviInContextEditor", {
      configurable: true,
      get() {
        throw new Error("hostile");
      },
    });
    const slot = install();

    const promise = slot.load();
    scripts()[0].dispatchEvent(new Event("load"));

    expect((await promise).code).toBe("no-global");
  });
});

describe("the protocol-1 contract", () => {
  const shape = (value: object): Record<string, string> =>
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, typeof (value as Record<string, unknown>)[key]]),
    );

  it("live slot → the same own keys and value types as the frozen protocol-1 fixture", async () => {
    const fixture = (await import(PROTOCOL_1_FIXTURE)).default as EditorLoaderSlot;

    const slot = install();

    expect(shape(slot)).toEqual(shape(fixture));
    expect(slot.protocol).toBe(fixture.protocol);
    expect(slot.url).toBe(fixture.url);
    expect(slot.editorVersion).toBe(fixture.editorVersion);
  });

  /** The frozen result literals, one per outcome. */
  const frozenResults = async (): Promise<Record<string, EditorLoadResult>> =>
    (await import(PROTOCOL_1_FIXTURE)).results as Record<string, EditorLoadResult>;

  it("the fixture's own load() → resolves with its frozen ok literal", async () => {
    const fixture = (await import(PROTOCOL_1_FIXTURE)).default as EditorLoaderSlot;

    expect(await fixture.load()).toBe((await frozenResults()).ok);
  });

  it("every frozen result → the same seven own keys", async () => {
    const keys = Object.values(await frozenResults()).map((result) => Object.keys(result).sort());

    expect(new Set(keys.map(String))).toEqual(
      new Set(["code,editorVersion,host,ok,protocol,sdkVersion,url"]),
    );
  });

  it("live ok result → exactly the fixture's keys and value types", async () => {
    const expected = (await frozenResults()).ok;
    win.ComviInContextEditor = { activate: () => {}, version: "0.6.0" };

    const result = await install().load();

    expect(shape(result)).toEqual(shape(expected));
    expect(result).toEqual({ ...expected, sdkVersion: pkg.version });
  });

  it("live ok result from an editor older than 0.6.0 → exactly the fixture's keys and value types", async () => {
    const expected = (await frozenResults())["ok-editor-before-0.6.0"];
    win.ComviInContextEditor = { activate: () => {} };

    const result = await install().load();

    expect(shape(result)).toEqual(shape(expected));
    expect(result).toEqual({ ...expected, sdkVersion: pkg.version });
  });

  it.each([
    [
      "csp-blocked",
      (script: HTMLScriptElement): void => {
        violation(script.src, "script-src-elem");
        script.dispatchEvent(new Event("error"));
      },
    ],
    [
      "load-error",
      (script: HTMLScriptElement): void => {
        script.dispatchEvent(new Event("error"));
      },
    ],
    [
      "timeout",
      (): void => {
        vi.advanceTimersByTime(10_000);
      },
    ],
    [
      "no-global",
      (script: HTMLScriptElement): void => {
        script.dispatchEvent(new Event("load"));
      },
    ],
  ] as const)("live %s result → exactly the fixture's keys and value types", async (code, fail) => {
    vi.useFakeTimers();
    const expected = (await frozenResults())[code];
    const promise = install().load();
    const script = scripts()[0];

    fail(script);
    const result = await promise;

    expect(shape(result)).toEqual(shape(expected));
    // Equal apart from what varies by build and by hour: the version and the salt.
    expect(result).toEqual({ ...expected, sdkVersion: pkg.version, url: script.src });
    expect(script.src.startsWith(`${expected.url}?comvi=`)).toBe(true);
  });

  it("live invalid-editor-version result → exactly the fixture's keys, value types and values", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const expected = (await frozenResults())["invalid-editor-version"];

    const result = await install("next").load();

    expect(shape(result)).toEqual(shape(expected));
    expect(result).toEqual({ ...expected, sdkVersion: pkg.version });
  });
});

describe("one slot per page", () => {
  it("two instances → one slot, installed by the first", () => {
    const first = install();

    const second = install();

    expect(second).toBe(first);
  });

  it("a slot with a newer protocol already present → not replaced", () => {
    const newer = {
      protocol: 2,
      sdkVersion: "9.0.0",
      editorVersion: "latest",
      url: "x",
      load() {},
    };
    slots[LOADER_KEY] = newer;

    install();

    expect(slots[LOADER_KEY]).toBe(newer);
  });

  it("a slot with an older protocol → replaced", () => {
    const older = { protocol: 0, load() {} };
    slots[LOADER_KEY] = older;

    const slot = install();

    expect(slot).not.toBe(older);
    expect(slot.protocol).toBe(1);
  });

  it("replaced during an in-flight load → the new slot reuses the pending promise, one script", () => {
    const first = install();
    const pending = first.load();
    (first as { protocol: number }).protocol = 0;

    const second = install();
    const reused = second.load();

    expect(second).not.toBe(first);
    expect(reused).toBe(pending);
    expect(scripts()).toHaveLength(1);
  });

  it("replaced after a finished load → the new slot resolves ok at once, no second script", async () => {
    const first = install();
    const loading = first.load();
    win.ComviInContextEditor = { activate: () => {} };
    scripts()[0].dispatchEvent(new Event("load"));
    await loading;
    (first as { protocol: number }).protocol = 0;

    const result = await install().load();

    expect(result.ok).toBe(true);
    expect(scripts()).toHaveLength(1);
  });

  it("reused slot with a different pin → one development warning, the existing pin wins", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = install("0.5.3");

    const second = install("0.5.4");

    expect(second).toBe(first);
    expect(second.editorVersion).toBe("0.5.3");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      'editorVersion ignored: another instance already installed the editor loader with "0.5.3"',
    );
  });

  it("reused slot with the same pin, or with no pin of its own → no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    install("0.5.3");

    install("0.5.3");
    install();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("a hostile or pre-planted slot", () => {
  it.each([
    ["null", null],
    ["a number", 7],
    ["a string", "slot"],
    ["an object with no protocol", {}],
    ["a NaN protocol", { protocol: Number.NaN }],
    ["a string protocol", { protocol: "high" }],
  ])("%s in the slot → replaced by a real one", (_label, planted) => {
    slots[LOADER_KEY] = planted;

    const slot = install();

    expect(slot).toMatchObject({ protocol: 1, url: LATEST_URL });
  });

  it("a slot whose protocol getter throws → construction survives and the instance is exposed", () => {
    slots[LOADER_KEY] = {
      get protocol(): number {
        throw new Error("hostile");
      },
    };

    const i18n = createI18n({ locale: "en" }).use(devtools({ instanceId: "survivor" }));

    expect(i18n.instanceId).toBe("survivor");
    expect(window.__COMVI__).toEqual([expect.objectContaining({ i: i18n })]);
  });

  it("a slot that throws when read → construction survives", () => {
    Object.defineProperty(slots, LOADER_KEY, {
      configurable: true,
      get() {
        throw new Error("hostile");
      },
    });

    const i18n = createI18n({ locale: "en" }).use(devtools({ instanceId: "survivor" }));

    expect(i18n.instanceId).toBe("survivor");
  });

  it("a frozen slot key → construction survives", () => {
    Object.defineProperty(slots, LOADER_KEY, {
      configurable: true,
      writable: false,
      value: undefined,
    });

    const i18n = createI18n({ locale: "en" }).use(devtools({ instanceId: "survivor" }));

    expect(i18n.instanceId).toBe("survivor");
  });

  it("a newer-protocol slot whose editorVersion getter throws → construction survives", () => {
    slots[LOADER_KEY] = {
      protocol: 2,
      get editorVersion(): string {
        throw new Error("hostile");
      },
    };

    const i18n = createI18n({ locale: "en" }).use(devtools({ editorVersion: "0.5.3" }));

    expect(i18n.instanceId).toBeDefined();
  });

  it("a planted slot → is never called during construction", () => {
    const load = vi.fn();
    slots[LOADER_KEY] = { protocol: 2, editorVersion: "latest", load };

    install();

    expect(load).not.toHaveBeenCalled();
  });
});
