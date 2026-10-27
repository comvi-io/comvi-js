/**
 * Runs the platform's CDN worker (fixtures/worker.mjs, a frozen bundle of
 * platform/apps/cdn-worker/src/index.ts) in-process under Node: an fs-backed R2 shim over
 * fixtures/cdn-root, an in-memory `caches.default`, and test controls that are not part
 * of the worker — `delay(path, ms)`, `log()`, `reset()`. Ported from lot-0 S5
 * `worker-host.mjs`.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
// @ts-expect-error — plain ESM fixture without types
import worker from "./fixtures/worker.mjs";

const ROOT = path.join(__dirname, "fixtures", "cdn-root");
const UPLOAD_CC = "public, max-age=30, must-revalidate, stale-if-error=604800";

const object = (key: string) => {
  const f = path.join(ROOT, key);
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return null;
  const buf = fs.readFileSync(f);
  return {
    httpEtag: `"${crypto.createHash("md5").update(buf).digest("hex")}"`,
    uploaded: fs.statSync(f).mtime,
    writeHttpMetadata(h: Headers) {
      h.set("content-type", "application/json");
      h.set("cache-control", UPLOAD_CC);
    },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};

export interface Entry {
  method: string;
  path: string;
  accept: string | null;
  headers: string[];
  aborted: boolean;
  status: number;
}

export const startWorkerHost = async () => {
  const BUCKET = { get: async (k: string) => object(k), head: async (k: string) => object(k) };
  const store = new Map<string, Response>();
  (globalThis as unknown as { caches: unknown }).caches = {
    default: {
      match: async (req: Request) => store.get(req.url)?.clone(),
      put: async (req: Request, res: Response) => void store.set(req.url, res),
    },
  };
  const delays = new Map<string, number>();
  let log: Entry[] = [];
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    const entry: Entry = {
      method: req.method!,
      path: u.pathname,
      accept: req.headers.accept ?? null,
      headers: Object.keys(req.headers),
      aborted: false,
      status: 0,
    };
    log.push(entry);
    req.on("close", () => {
      if (!res.writableFinished) entry.aborted = true;
    });
    const d = delays.get(u.pathname.slice(1));
    if (d) await new Promise((r) => setTimeout(r, d));
    if (entry.aborted) return;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const wreq = new Request("http://cdn.local" + req.url, { method: req.method, headers });
    const pending: Promise<unknown>[] = [];
    const wres: Response = await worker.fetch(
      wreq,
      { BUCKET },
      { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} },
    );
    await Promise.all(pending);
    entry.status = wres.status;
    res.writeHead(wres.status, Object.fromEntries(wres.headers));
    res.end(Buffer.from(await wres.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    delay: (p: string, ms: number) => void delays.set(p, ms),
    log: () => log.map((e) => `${e.status} ${e.path}${e.aborted ? " ABORTED" : ""}`),
    entries: () => log,
    reset: () => {
      delays.clear();
      log = [];
      store.clear();
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
};
