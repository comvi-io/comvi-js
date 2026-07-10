/**
 * Cross-repo shape lock (RALPLAN wave-2a code-review B1). Drives an actual
 * element through the FULL collector pipeline (enumerate -> signals ->
 * buildNeighborCandidates -> inferTargetType -> Observation construction ->
 * transport) and asserts the exact JSON sent on POST /v1/context/usages
 * matches the committed fixture (`src/collector/hash/wire-observation.fixture.json`)
 * byte-for-byte (well, structurally — JSON key order doesn't matter for
 * `toEqual`, but every field/value must match exactly).
 *
 * worker-platform validates a byte-identical copy of the fixture against the
 * server's `ObservationSchema`/`NeighborRefSchema`
 * (apps/api/src/modules/context/api.schemas.ts) — this is the seam test that
 * would have caught the B1 shape mismatch (stray `readingOrderIndex`/`debug`
 * top-level fields, extra `ariaRole`/`hasAriaLabel`/`textLength` on
 * neighbors) before it ever reached real traffic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/EventBus";
import { TranslationRegistry } from "../src/TranslationRegistry";
import { Collector } from "../src/collector/Collector";
import { initApiConfig, resetApiConfig } from "../src/config/api";
import { mockBoundingClientRect, cleanupDOM } from "./helpers";
import fixture from "../src/collector/hash/wire-observation.fixture.json";

const SCOPE = "wire-observation-fixture-scope";

function mockOkResponse<T>(payload: T): Response {
  return { ok: true, status: 200, statusText: "OK", json: async () => payload } as Response;
}

describe("collector wire shape — cross-repo fixture lock (B1)", () => {
  beforeEach(() => {
    initApiConfig("test-api-key", SCOPE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetApiConfig(SCOPE);
    cleanupDOM();
  });

  it("produces the exact committed fixture when driven through the real pipeline", async () => {
    (window as unknown as { happyDOM?: { setURL?: (url: string) => void } }).happyDOM?.setURL?.(
      "https://example.com/checkout",
    );

    const fetchMock = vi.fn();
    fetchMock.mockResolvedValue(mockOkResponse({ entries: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const eventBus = new EventBus();
    const registry = new TranslationRegistry(eventBus);

    // A dialog containing a heading and a submit button — deterministic
    // rects/styles so the produced observation is stable across runs.
    const dialog = document.createElement("dialog");
    document.body.appendChild(dialog);
    mockBoundingClientRect(dialog, {
      top: 80,
      left: 80,
      width: 400,
      height: 300,
      right: 480,
      bottom: 380,
    });

    const heading = document.createElement("h2");
    heading.textContent = "Checkout";
    dialog.appendChild(heading);
    mockBoundingClientRect(heading, {
      top: 100,
      left: 100,
      width: 300,
      height: 24,
      right: 400,
      bottom: 124,
    });
    registry.add(heading, {
      nodes: new Map([[document.createTextNode("t"), { key: "checkout.title", ns: "common" }]]),
    });

    const button = document.createElement("button");
    button.type = "submit";
    button.style.whiteSpace = "nowrap";
    button.style.fontSize = "16px";
    dialog.appendChild(button);
    mockBoundingClientRect(button, {
      top: 140,
      left: 100,
      width: 120,
      height: 36,
      right: 220,
      bottom: 176,
    });
    registry.add(button, {
      nodes: new Map([[document.createTextNode("t"), { key: "checkout.submit", ns: "common" }]]),
    });

    const collector = new Collector(eventBus, registry, SCOPE, { enabled: true });
    await collector.start();
    await Promise.resolve();
    await Promise.resolve();

    const usagesCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes("/v1/context/usages"),
    );
    expect(usagesCall).toBeDefined();
    const body = JSON.parse((usagesCall![1] as RequestInit).body as string);

    expect(body.items).toEqual(fixture.items);

    collector.destroy();
  });
});
