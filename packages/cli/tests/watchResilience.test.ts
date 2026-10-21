import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/core/ApiClient";
import { ErrorCodes, type TypegenError } from "../src/utils/errors";
import type { ProjectInfo } from "../src/types";
import { mockEventSource, type FakeEventSource } from "./helpers";

/**
 * `typegen --watch` has to survive what a deploy does to a long-lived stream
 * (a 502, a dropped socket, a proxy that goes quiet) and fail loudly when the
 * key stops working. eventsource itself gives up for good on any non-200.
 */

const projectInfo = { id: 123, name: "Acme" } as ProjectInfo;

let instances: FakeEventSource[];
let client: ApiClient;
let fatal: TypegenError[];
let notices: string[];
let cleanup: () => void;

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function subscribe(): Promise<void> {
  ({ instances } = mockEventSource());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => projectInfo }) as Response),
  );
  const { ApiClient: MockedApiClient } = await import("../src/core/ApiClient");
  client = new MockedApiClient({ apiKey: "k", apiBaseUrl: "https://api.test.com" });
  fatal = [];
  notices = [];
  cleanup = await client.subscribeToSchemaUpdates(async () => {}, {
    onFatal: (error) => fatal.push(error),
    onNotice: (message) => notices.push(message),
  });
}

/** What eventsource does on a non-200: report it, then close for good. */
function failForGood(source: FakeEventSource, code: number): void {
  source.readyState = 2;
  source.onerror?.({ code, message: `Non-200 status code (${code})` });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"],
  });
});

afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock("eventsource");
  vi.resetModules();
});

describe("typegen --watch stream", () => {
  it("opens a new stream after a 502, with growing waits", async () => {
    await subscribe();
    expect(instances).toHaveLength(1);

    failForGood(instances[0], 502);
    await vi.advanceTimersByTimeAsync(999);
    expect(instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(instances).toHaveLength(2);
    expect(notices.join("\n")).toMatch(/502.*reconnecting in 1s/);

    failForGood(instances[1], 503);
    await vi.advanceTimersByTimeAsync(1999);
    expect(instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(instances).toHaveLength(3);
  });

  it("waits the base delay again once a stream has opened", async () => {
    await subscribe();
    failForGood(instances[0], 502);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();

    instances[1].readyState = 1;
    instances[1].onopen?.();
    failForGood(instances[1], 502);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();

    expect(instances).toHaveLength(3);
  });

  it.each([401, 403])("stops for good and reports a %i as fatal", async (code) => {
    await subscribe();

    failForGood(instances[0], code);
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();

    expect(instances).toHaveLength(1);
    expect(fatal).toHaveLength(1);
    expect(fatal[0].code).toBe(ErrorCodes.API_AUTH_FAILED);
  });

  it("reconnects a stream that has sent nothing for 45 seconds", async () => {
    await subscribe();
    instances[0].readyState = 1;

    await vi.advanceTimersByTimeAsync(60_000);
    await flush();

    expect(instances[0].closed).toBe(true);
    expect(instances.length).toBeGreaterThanOrEqual(2);
    expect(notices.join("\n")).toContain("no data");
  });

  it("keeps a stream that the platform pings", async () => {
    await subscribe();
    const source = instances[0];
    source.readyState = 1;

    // The platform's `: ping` comments never reach onmessage; the client sees
    // them on the response body its fetch hands to eventsource.
    let push: (chunk: string) => void = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (chunk) => controller.enqueue(new TextEncoder().encode(chunk));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { headers: { "content-type": "text/event-stream" } })),
    );
    const response = await source.fetch!("https://api.test.com/stream", {});
    const reader = response.body!.getReader();

    for (let i = 0; i < 6; i++) {
      push(": ping\n\n");
      await reader.read();
      await vi.advanceTimersByTimeAsync(15_000);
    }

    expect(source.closed).toBe(false);
    expect(instances).toHaveLength(1);
  });

  it("stops reconnecting after cleanup", async () => {
    await subscribe();
    failForGood(instances[0], 502);
    cleanup();

    await vi.advanceTimersByTimeAsync(60_000);
    await flush();

    expect(instances).toHaveLength(1);
  });
});
