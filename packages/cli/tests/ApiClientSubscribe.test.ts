import { describe, it, expect, vi, afterEach } from "vitest";
import type { ProjectInfo, ProjectSchema } from "../src/types";
import type { ApiClient } from "../src/core/ApiClient";

const projectInfo: ProjectInfo = {
  id: 123,
  organizationId: 1,
  name: "Test Project",
  description: "A test project",
  sourceLocale: "en",
};

interface SseFetchInit {
  headers?: Record<string, string> | Headers;
}

interface CapturedEventSource {
  url: string;
  options?: { fetch?: (input: unknown, init?: SseFetchInit) => Promise<unknown> };
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  closed: boolean;
}

/**
 * Replaces the lazily imported `eventsource` module with a fake that records
 * constructor arguments. A `gate` postpones the module's availability so tests
 * can interleave `close()`/re-subscribe with an in-flight subscription setup.
 */
function fakeEventSourceModule(gate?: Promise<void>): { instances: CapturedEventSource[] } {
  const instances: CapturedEventSource[] = [];

  class FakeEventSource implements CapturedEventSource {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    url: string;
    options?: CapturedEventSource["options"];

    constructor(url: unknown, options?: CapturedEventSource["options"]) {
      this.url = String(url);
      this.options = options;
      instances.push(this);
    }

    close(): void {
      this.closed = true;
    }
  }

  vi.doMock("eventsource", async () => {
    if (gate) {
      await gate;
    }
    return { EventSource: FakeEventSource };
  });

  return { instances };
}

async function importClient(): Promise<ApiClient> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => projectInfo }) as Response),
  );
  const { ApiClient: MockedApiClient } = await import("../src/core/ApiClient");
  return new MockedApiClient({ apiKey: "test-api-key", apiBaseUrl: "https://api.test.com" });
}

/** Runs all pending microtasks so in-flight subscription work settles. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function schemaEvent(schema: ProjectSchema): MessageEvent {
  return { data: JSON.stringify(schema) } as MessageEvent;
}

describe("ApiClient schema subscription", () => {
  afterEach(() => {
    vi.doUnmock("eventsource");
    vi.resetModules();
  });

  it("opens the SSE stream at the project's schema stream endpoint", async () => {
    const { instances } = fakeEventSourceModule();
    const client = await importClient();

    await client.subscribeToSchemaUpdates(async () => {});

    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe("https://api.test.com/v1/projects/123/schema/stream");
  });

  it("authenticates SSE requests through the injected fetch", async () => {
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    await client.subscribeToSchemaUpdates(async () => {});

    const sseFetch = instances[0].options?.fetch;
    expect(typeof sseFetch).toBe("function");

    const sentinel = { ok: true } as Response;
    const innerFetch = vi.fn(async (_input: unknown, _init?: RequestInit) => sentinel);
    vi.stubGlobal("fetch", innerFetch);

    const result = await sseFetch!("https://api.test.com/v1/projects/123/schema/stream", {
      headers: { "x-extra": "1" },
    });

    expect(result).toBe(sentinel);
    expect(innerFetch).toHaveBeenCalledTimes(1);
    const [input, init] = innerFetch.mock.calls[0];
    expect(input).toBe("https://api.test.com/v1/projects/123/schema/stream");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-api-key");
    expect(headers.get("x-extra")).toBe("1");
  });

  it("authenticates SSE requests that carry no init at all", async () => {
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    await client.subscribeToSchemaUpdates(async () => {});

    const innerFetch = vi.fn(
      async (_input: unknown, _init?: RequestInit) => ({ ok: true }) as Response,
    );
    vi.stubGlobal("fetch", innerFetch);

    await instances[0].options!.fetch!("https://api.test.com/stream");

    const [, init] = innerFetch.mock.calls[0];
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-api-key");
  });

  it("delivers parsed schema updates to the subscriber", async () => {
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    const onSchema = vi.fn(async () => {});
    await client.subscribeToSchemaUpdates(onSchema);

    instances[0].onmessage!(schemaEvent({ keys: { "common:welcome": { params: [] } } }));
    await flush();

    expect(onSchema).toHaveBeenCalledWith({ keys: { "common:welcome": { params: [] } } });
  });

  it("logs malformed SSE events and keeps processing later ones", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    const onSchema = vi.fn(async () => {});
    await client.subscribeToSchemaUpdates(onSchema);

    instances[0].onmessage!({ data: "not json" } as MessageEvent);
    await flush();

    expect(onSchema).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain("Failed to process SSE event");

    instances[0].onmessage!(schemaEvent({ keys: {} }));
    await flush();
    expect(onSchema).toHaveBeenCalledWith({ keys: {} });
  });

  it("warns that the stream reconnects when it reports an error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    await client.subscribeToSchemaUpdates(async () => {});

    instances[0].onerror!();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("reconnecting");
  });

  it("closes the stream and drops events after cleanup", async () => {
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    const onSchema = vi.fn(async () => {});
    const cleanup = await client.subscribeToSchemaUpdates(onSchema);

    cleanup();

    expect(instances[0].closed).toBe(true);
    instances[0].onmessage!(schemaEvent({ keys: {} }));
    await flush();
    expect(onSchema).not.toHaveBeenCalled();
  });

  it("closes the stream and drops events after close()", async () => {
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    const onSchema = vi.fn(async () => {});
    await client.subscribeToSchemaUpdates(onSchema);

    client.close();

    expect(instances[0].closed).toBe(true);
    instances[0].onmessage!(schemaEvent({ keys: {} }));
    await flush();
    expect(onSchema).not.toHaveBeenCalled();
  });

  it("close() without an active subscription is a no-op", async () => {
    const client = await importClient();

    expect(() => client.close()).not.toThrow();
  });

  it("cleaning up a stale subscription leaves the active one untouched", async () => {
    const { instances } = fakeEventSourceModule();
    const client = await importClient();
    const onSchema = vi.fn(async () => {});
    const cleanupFirst = await client.subscribeToSchemaUpdates(onSchema);
    await client.subscribeToSchemaUpdates(onSchema);

    expect(instances[0].closed).toBe(true); // superseded stream was closed
    cleanupFirst();

    instances[1].onmessage!(schemaEvent({ keys: {} }));
    await flush();
    expect(onSchema).toHaveBeenCalledWith({ keys: {} });
  });

  it("a subscription superseded during setup never opens a stream", async () => {
    let releaseImport!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    const { instances } = fakeEventSourceModule(gate);
    const client = await importClient();

    const pending = client.subscribeToSchemaUpdates(async () => {});
    await flush(); // parked waiting for the eventsource import
    client.close(); // supersedes the still-pending subscription
    releaseImport();
    const cleanup = await pending;

    expect(instances).toHaveLength(0);
    expect(() => cleanup()).not.toThrow(); // the superseded subscription's cleanup is inert
  });
});
