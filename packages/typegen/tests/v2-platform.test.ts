/**
 * The platform source over a fake `fetch`: the v2 route, the key's handling, and watch
 * on the v1 SSE stream as a change signal. The real-platform parity (same catalogs →
 * same bytes as a local directory) is tests/v2-parity.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generate, watch, type GenerateMessage, type Watcher, type WireSchema } from "../src/index";

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
    await w.idle();
    expect(w.stats).toMatchObject({ runs: 1, writes: 1 });
    // A burst of three events: one fetch of v2.
    p.setSchema({
      ...SCHEMA,
      namespaces: { default: { ...SCHEMA.namespaces.default, bye: {} } },
    });
    p.event("data: {}\n\n");
    p.event(": ping\n\ndata: {}\n\n");
    p.event("data: {}\r\n\r\n");
    await vi.waitFor(() => expect(w.stats.runs).toBe(2), { timeout: 5000, interval: 10 });
    await w.idle();
    expect(w.stats.writes).toBe(2);
    expect(fs.readFileSync(path.join(dir, "comvi.d.ts"), "utf8")).toContain('"bye": never;');
    expect(p.calls.filter((c) => c.endsWith("/schema/v2"))).toHaveLength(2);
    // A comment line (the platform's ping) alone is not a change.
    p.event(": ping\n\n");
    await new Promise((r) => setTimeout(r, 120));
    expect(w.stats.runs).toBe(2);
    expect(list.some((m) => m.text.includes(KEY))).toBe(false);
  });
});
