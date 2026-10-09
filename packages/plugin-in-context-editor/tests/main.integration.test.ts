/**
 * The manual `init()` / `stop()` pair against the real `Core`: what a
 * translator can still do on the page after each call, however many times
 * `init()` ran before it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { init, stop } from "../src/main";
import { loadKeyMappings } from "../src/translation";
import { TAG_ATTRIBUTES } from "../src/constants";
import { Core } from "../src/Core";
import { initApiConfig, resetApiConfig, type ApiTransport } from "../src/config/api";
import { cleanupDOM, flushDOMMutations } from "./helpers";
import { contextApiResponse, contextPaths } from "./helpers/contextWire";
import { hoverLabel, renderMarked } from "./helpers/editorPage";

function renderTarget(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  return container;
}

/**
 * `init()` builds its runtime without any API configuration, so a test that
 * wants to watch the wire configures the scope the NEXT runtime will get. Ids
 * are `core-<counter>` (pinned by Core.i18n-instances.test.ts); a probe Core
 * reads the counter and is stopped at once.
 */
function transportForNextRuntime(): ReturnType<typeof vi.fn<ApiTransport>> {
  const probe = new Core();
  const nextId = `core-${Number(probe.getInstanceId().slice("core-".length)) + 1}`;
  probe.stop();
  const transport = vi.fn<ApiTransport>((path) => contextApiResponse(path));
  initApiConfig(undefined, nextId, { transport });
  return transport;
}

afterEach(() => {
  stop();
  resetApiConfig();
  cleanupDOM();
  loadKeyMappings({});
});

describe("manual init()", () => {
  it("init() once → the page's marked text is highlighted", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });

    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });

    expect(await hoverLabel(heading)).toBe("home.title (default)");
  });

  it("init({ targetElement }) → marked text outside the target is not highlighted", async () => {
    const container = renderTarget();
    const outside = renderMarked("footer.copyright", { text: "©" });

    init({ targetElement: container });

    expect(await hoverLabel(outside)).toBeNull();
  });

  it("init() on a second target → the first target's text is no longer highlighted", async () => {
    const first = renderTarget();
    const second = renderTarget();
    const firstHeading = renderMarked("home.title", { text: "Welcome", parent: first });
    init({ targetElement: first });

    init({ targetElement: second });

    expect(await hoverLabel(firstHeading)).toBeNull();
  });

  it("init() on a second target → the second target's text is highlighted", async () => {
    const first = renderTarget();
    const second = renderTarget();
    const secondHeading = renderMarked("checkout.total", { text: "Total", parent: second });
    init({ targetElement: first });

    init({ targetElement: second });

    expect(await hoverLabel(secondHeading)).toBe("checkout.total (default)");
  });
});

describe("manual init() and context collection", () => {
  it("init() with a transport configured → the context handshake leaves through it", async () => {
    renderMarked("home.title", { text: "Welcome" });
    const transport = transportForNextRuntime();

    init();
    await flushDOMMutations();

    expect(contextPaths(transport.mock.calls)).toContain("/v1/context/handshake");
  });

  it("init({ collectContext: false }) with a transport configured → no /v1/context request leaves", async () => {
    renderMarked("home.title", { text: "Welcome" });
    const transport = transportForNextRuntime();

    init({ collectContext: false });
    await flushDOMMutations();

    expect(contextPaths(transport.mock.calls)).toEqual([]);
  });
});

describe("manual stop()", () => {
  it("init() then stop() → the page's marked text is no longer highlighted", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });
    init({ targetElement: container });

    stop();

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("init() twice then stop() → no runtime still highlights the page", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });
    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });
    init({ targetElement: container, tagAttributes: TAG_ATTRIBUTES });

    stop();

    expect(await hoverLabel(heading)).toBeNull();
  });

  it("stop() before any init() → does not throw", () => {
    expect(() => stop()).not.toThrow();
  });

  it("stop() before any init() → a later init() still highlights the page", async () => {
    const container = renderTarget();
    const heading = renderMarked("home.title", { text: "Welcome", parent: container });
    stop();

    init({ targetElement: container });

    expect(await hoverLabel(heading)).toBe("home.title (default)");
  });

  it("stop() twice after one init() → the second stop() does not throw", () => {
    init({ targetElement: renderTarget() });
    stop();

    expect(() => stop()).not.toThrow();
  });
});
