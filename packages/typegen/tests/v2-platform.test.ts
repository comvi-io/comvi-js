/**
 * The platform source over a fake `fetch`: the v2 route, the key's handling, and watch
 * on the v1 SSE stream as a change signal. The real-platform parity (same catalogs →
 * same bytes as a local directory) is packages/cli/e2e/typegen-v2.e2e.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  generate,
  PlatformSource,
  watch,
  type GenerateMessage,
  type Watcher,
  type WireSchema,
} from "../src/index";

const KEY = "cmv_secret_key_do_not_print";
const SCHEMA: WireSchema = {
  v: 2,
  sourceLocale: "en",
  namespaces: { default: { hello: { params: { name: { kind: "string" } } } } },
};

const dirs: string[] = [];
const watchers: Watcher[] = [];
afterEach(() => {
  for (const w of watchers.splice(0)) w.close();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function root(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-typegen-platform-"));
  dirs.push(dir);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ dependencies: { "@comvi/core": "*" } }),
  );
  return dir;
}

/** A platform: GET /v1/project, /schema/v2 (current `schema`), /schema/stream (SSE). */
function platform(options: { status?: number } = {}) {
  let schema: WireSchema = SCHEMA;
  const calls: string[] = [];
  let push: ((event: string) => void) | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url.replace("https://tms.test", ""));
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer ${KEY}` || options.status)
      return new Response("{}", { status: options.status ?? 401 });
    if (url.endsWith("/v1/project")) return Response.json({ id: 7, name: "p" });
    if (url.endsWith("/v1/projects/7/schema/v2")) return Response.json(schema);
    if (url.endsWith("/v1/projects/7/schema/stream")) {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          push = (event) => controller.enqueue(encoder.encode(event));
          // On connect the platform sends the full v1 schema.
          push('data: {"keys":{}}\n\n');
        },
      });
      init?.signal?.addEventListener("abort", () => body.cancel().catch(() => undefined));
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response("{}", { status: 404 });
  });
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    calls,
    setSchema: (s: WireSchema) => void (schema = s),
    event: (e: string) => push!(e),
  };
}

describe("generate({ from: { platform } })", () => {
  it("reads the v2 route of the key's project, with the key as a Bearer token", async () => {
    const p = platform();
    const dir = root();
    const r = await generate({
      from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test/", fetch: p.fetch } },
      out: "comvi.d.ts",
      root: dir,
    });
    expect(p.calls).toEqual(["/v1/project", "/v1/projects/7/schema/v2"]);
    expect(r.content).toContain('"hello": { "name": string | number };');
    expect(fs.readFileSync(path.join(dir, "comvi.d.ts"), "utf8")).toBe(r.content);
    expect(fs.readFileSync(path.join(dir, "comvi.d.ts"), "utf8")).not.toContain(KEY);
  });

  it("takes the key from COMVI_API_KEY and never prints it in an error", async () => {
    const p = platform({ status: 401 });
    vi.stubEnv("COMVI_API_KEY", KEY);
    const error = await generate({
      from: { platform: { apiBaseUrl: "https://tms.test", fetch: p.fetch } },
      out: "comvi.d.ts",
      root: root(),
    }).catch((e: Error) => e);
    expect((error as Error).message).toBe(
      "Cannot read the project of the API key from https://tms.test: the API key was rejected",
    );
    expect(String((error as Error).stack)).not.toContain(KEY);
  });

  it("asks for a key when there is none", async () => {
    vi.stubEnv("COMVI_API_KEY", "");
    await expect(
      generate({ from: { platform: {} }, out: "comvi.d.ts", root: root() }),
    ).rejects.toThrow(
      "An API key is required to generate types from the Comvi platform: set COMVI_API_KEY",
    );
  });

  it("refuses a response that is not a v2 schema", async () => {
    const p = platform();
    p.setSchema({ keys: {} } as unknown as WireSchema);
    await expect(
      generate({
        from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test", fetch: p.fetch } },
        out: "comvi.d.ts",
        root: root(),
      }),
    ).rejects.toThrow("Invalid typegen schema v2 at v: expected 2, received undefined");
  });
});

describe("watch({ from: { platform } })", () => {
  it("fetches v2 on connect and on every stream event, debounced; writes only on change", async () => {
    const p = platform();
    const dir = root();
    const list: GenerateMessage[] = [];
    const w = watch({
      from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test", fetch: p.fetch } },
      out: "comvi.d.ts",
      root: dir,
      debounceMs: 50,
      onMessage: (m) => void list.push(m),
    });
    watchers.push(w);
    await w.ready;
    // The first run did not wait for the stream; its connect event fetches once more,
    // and the unchanged schema is not written again.
    expect(w.stats.runs).toBeGreaterThanOrEqual(1);
    await vi.waitFor(() => expect(w.stats.runs).toBe(2), { timeout: 5000, interval: 10 });
    await w.idle();
    expect(w.stats).toMatchObject({ runs: 2, writes: 1 });
    // The two lookups of the key's project at start share one request.
    expect(p.calls.filter((c) => c === "/v1/project")).toHaveLength(1);
    // A burst of three events: one fetch of v2.
    p.setSchema({
      ...SCHEMA,
      namespaces: { default: { ...SCHEMA.namespaces.default, bye: {} } },
    });
    p.event("data: {}\n\n");
    p.event(": ping\n\ndata: {}\n\n");
    p.event("data: {}\r\n\r\n");
    await vi.waitFor(() => expect(w.stats.runs).toBe(3), { timeout: 5000, interval: 10 });
    await w.idle();
    expect(w.stats.writes).toBe(2);
    expect(fs.readFileSync(path.join(dir, "comvi.d.ts"), "utf8")).toContain('"bye": never;');
    expect(p.calls.filter((c) => c.endsWith("/schema/v2"))).toHaveLength(3);
    // A comment line (the platform's ping) alone is not a change.
    p.event(": ping\n\n");
    await new Promise((r) => setTimeout(r, 120));
    expect(w.stats.runs).toBe(3);
    expect(list.some((m) => m.text.includes(KEY))).toBe(false);
  });

  it("a refused key stops the watcher through onFatal, once", async () => {
    let streams = 0;
    const base = platform();
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/schema/stream") && ++streams > 0)
        return new Response("", { status: 403 });
      return base.fetch(input, init);
    }) as typeof globalThis.fetch;
    const fatal = vi.fn();
    const list: GenerateMessage[] = [];
    const w = watch({
      from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test", fetch } },
      out: "comvi.d.ts",
      root: root(),
      onMessage: (m) => void list.push(m),
      onFatal: fatal,
    });
    watchers.push(w);
    await w.ready;
    await vi.waitFor(() => expect(fatal).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(fatal.mock.calls[0][0]).toMatchObject({ status: 403 });
    expect(list.filter((m) => m.level === "error").map((m) => m.text)).toEqual([
      "The schema stream refused the API key (HTTP 403)",
    ]);
    expect(streams).toBe(1);
  });

  it("a key refused on the project lookup stops the watcher too, with one message", async () => {
    const p = platform({ status: 401 });
    const fatal = vi.fn();
    const list: GenerateMessage[] = [];
    const w = watch({
      from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test", fetch: p.fetch } },
      out: "comvi.d.ts",
      root: root(),
      onMessage: (m) => void list.push(m),
      onFatal: fatal,
    });
    watchers.push(w);
    await w.ready;
    await vi.waitFor(() => expect(fatal).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(fatal.mock.calls[0][0]).toMatchObject({ status: 401 });
    // No retry: no stream was ever opened, no reconnect notice was printed.
    await new Promise((r) => setTimeout(r, 1200));
    expect(p.calls.filter((c) => c.endsWith("/schema/stream"))).toHaveLength(0);
    expect(list.filter((m) => m.level === "info")).toEqual([]);
    expect(list.filter((m) => m.level === "error")).toHaveLength(1);
    expect(list[0].text).toContain("the API key was rejected");
  });

  it("a response that arrives after close() is dropped, never written over the successor", async () => {
    const OLD: WireSchema = { ...SCHEMA, namespaces: { default: { old: {} } } };
    const NEW: WireSchema = { ...SCHEMA, namespaces: { default: { new: {} } } };
    // The first watcher's schema request hangs until `release()`, then answers OLD.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const slow = platform();
    slow.setSchema(OLD);
    let asked = false;
    const slowFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/schema/v2")) {
        asked = true;
        await held;
      }
      return slow.fetch(input, init);
    }) as typeof globalThis.fetch;
    const fast = platform();
    fast.setSchema(NEW);
    const dir = root();
    const file = path.join(dir, "comvi.d.ts");
    const begin = (fetch: typeof globalThis.fetch) => {
      const w = watch({
        from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test", fetch } },
        out: "comvi.d.ts",
        root: dir,
        debounceMs: 20,
        onMessage: () => undefined,
      });
      watchers.push(w);
      return w;
    };
    const a = begin(slowFetch);
    const b = begin(fast.fetch);
    expect([a.active, b.active]).toEqual([true, false]);
    await vi.waitFor(() => expect(asked).toBe(true), { timeout: 5000, interval: 5 });
    // Closed while its request is in flight: the successor takes over and writes NEW.
    a.close();
    expect(b.active).toBe(true);
    await vi.waitFor(() => expect(fs.readFileSync(file, "utf8")).toContain('"new": never;'), {
      timeout: 5000,
      interval: 10,
    });
    // The old request now answers; its OLD schema must not reach the file.
    release();
    await a.idle();
    await b.idle();
    expect(fs.readFileSync(file, "utf8")).toContain('"new": never;');
    expect(fs.readFileSync(file, "utf8")).not.toContain('"old"');
    expect(a.stats.writes).toBe(0);
  });

  it("a refused key frees the file: the watcher is inactive and a waiting one takes over", async () => {
    const refused = platform({ status: 401 });
    const working = platform();
    const dir = root();
    const begin = (fetch: typeof globalThis.fetch, onFatal?: () => void) => {
      const w = watch({
        from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test", fetch } },
        out: "comvi.d.ts",
        root: dir,
        debounceMs: 20,
        onMessage: () => undefined,
        onFatal,
      });
      watchers.push(w);
      return w;
    };
    const fatal = vi.fn();
    const a = begin(refused.fetch, fatal);
    const b = begin(working.fetch);
    expect([a.active, b.active]).toEqual([true, false]);
    await vi.waitFor(() => expect(fatal).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect([a.active, b.active]).toEqual([false, true]);
    await vi.waitFor(
      () => expect(fs.readFileSync(path.join(dir, "comvi.d.ts"), "utf8")).toContain('"hello"'),
      { timeout: 5000, interval: 10 },
    );
  });

  it("an unreachable platform: ready settles after the reported first run", async () => {
    const down = (async () => {
      throw new Error("fetch failed", { cause: { code: "ECONNREFUSED" } });
    }) as unknown as typeof fetch;
    const list: GenerateMessage[] = [];
    const w = watch({
      from: { platform: { apiKey: KEY, apiBaseUrl: "https://tms.test", fetch: down } },
      out: "comvi.d.ts",
      root: root(),
      onMessage: (m) => void list.push(m),
    });
    watchers.push(w);
    await w.ready;
    expect(w.stats.runs).toBe(1);
    expect(list.find((m) => m.level === "error")?.text).toBe(
      "Cannot reach https://tms.test for the project of the API key: fetch failed (ECONNREFUSED); comvi.d.ts is kept as it was",
    );
  });
});

describe("PlatformSource errors", () => {
  const source = (fetch: typeof globalThis.fetch, apiBaseUrl = "https://tms.test") =>
    new PlatformSource({ apiKey: KEY, apiBaseUrl, fetch });

  it.each([
    [403, "the API key may not read the schema (scope schema:read)"],
    [500, "HTTP 500"],
  ])("names HTTP %i", async (status, reason) => {
    const f = (async () => new Response("x", { status })) as unknown as typeof fetch;
    await expect(source(f).schema()).rejects.toThrow(
      `Cannot read the project of the API key from https://tms.test: ${reason}`,
    );
  });

  it("an unreachable platform, a non-JSON answer and a project without id", async () => {
    const down = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    await expect(source(down).schema()).rejects.toThrow(
      "Cannot reach https://tms.test for the project of the API key: ECONNREFUSED",
    );
    const html = (async () => new Response("<html>")) as unknown as typeof fetch;
    await expect(source(html).schema()).rejects.toThrow(
      "The project of the API key from https://tms.test is not JSON",
    );
    const noId = (async () => Response.json({ name: "x" })) as unknown as typeof fetch;
    await expect(source(noId).schema()).rejects.toThrow("has no numeric id");
  });

  it("refuses a base URL that is not http(s)", () => {
    expect(() => source(fetch, "ftp://x")).toThrow(
      'apiBaseUrl must be an http(s) URL, received "ftp://x"',
    );
    expect(() => source(fetch, "not a url")).toThrow("apiBaseUrl must be an http(s) URL");
  });

  it("the stream: 401 stops for good through onFatal; a dropped stream reconnects", async () => {
    vi.useFakeTimers();
    try {
      let streams = 0;
      const f = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/v1/project")) return Response.json({ id: 7 });
        streams++;
        // First stream ends at once, the second is refused.
        return streams === 1 ? new Response("data: {}\n\n") : new Response("", { status: 401 });
      }) as unknown as typeof fetch;
      const changes = vi.fn();
      const notices: string[] = [];
      const fatal = vi.fn();
      const stop = source(f).subscribe(changes, {
        onNotice: (m) => notices.push(m),
        onFatal: fatal,
      });
      await vi.waitFor(() => expect(notices).toEqual(["schema stream ended; reconnecting in 1 s"]));
      expect(changes).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(() => expect(fatal).toHaveBeenCalledTimes(1));
      expect((fatal.mock.calls[0][0] as Error).message).toBe(
        "The schema stream refused the API key (HTTP 401)",
      );
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
