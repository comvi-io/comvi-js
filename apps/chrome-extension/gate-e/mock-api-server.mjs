/**
 * Gate-E mock API + static server.
 *
 * Serves the hostile page at `/` and answers the editor's API routes so the
 * extension can reach an *active* session without the real backend or a real
 * key. Crucially, it is the GROUND TRUTH for egress: every `/v1/*` request the
 * service worker makes is logged with its Authorization header. The hostile
 * page reads `/__log` (same origin) to assert that no unauthorized request
 * ever reached the API.
 *
 * Run: node gate-e/mock-api-server.mjs   (listens on 127.0.0.1:8787)
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOST = "127.0.0.1";
const PORT = 8791;
const DIR = dirname(fileURLToPath(import.meta.url));

/** @type {{method:string,path:string,auth:string|null,at:number}[]} */
const apiLog = [];
let nextProjectDelayMs = 0;
let nextLocalesResponseBytes = 0;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    // The extension SW fetch does not need CORS (host permission), but the
    // page's harness bookkeeping fetches do.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    ...headers,
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function sendLargeJson(res, totalBytes) {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.write('{"padding":"');
  let remaining = Math.max(0, totalBytes - 14);
  const chunk = "x".repeat(64 * 1024);
  while (remaining > 0) {
    const size = Math.min(remaining, chunk.length);
    res.write(chunk.slice(0, size));
    remaining -= size;
  }
  res.end('"}');
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  // --- harness bookkeeping (not part of the API surface) ---
  if (path === "/" || path === "/index.html") {
    return send(res, 200, readFileSync(join(DIR, "hostile-page.html"), "utf8"), {
      "Content-Type": "text/html; charset=utf-8",
    });
  }
  if (path === "/__log") {
    return send(res, 200, { requests: apiLog });
  }
  if (path === "/__reset") {
    apiLog.length = 0;
    nextProjectDelayMs = 0;
    nextLocalesResponseBytes = 0;
    return send(res, 200, { ok: true });
  }
  if (path === "/__config") {
    const projectDelay = Number(url.searchParams.get("nextProjectDelayMs"));
    const localesBytes = Number(url.searchParams.get("nextLocalesResponseBytes"));
    if (Number.isFinite(projectDelay) && projectDelay >= 0) nextProjectDelayMs = projectDelay;
    if (Number.isFinite(localesBytes) && localesBytes >= 0) {
      nextLocalesResponseBytes = localesBytes;
    }
    return send(res, 200, { nextProjectDelayMs, nextLocalesResponseBytes });
  }

  // --- mocked API surface: log EVERYTHING that reaches /v1 or /api ---
  if (path.startsWith("/v1/") || path.startsWith("/api/")) {
    apiLog.push({
      method: req.method,
      path: path + url.search,
      auth: req.headers["authorization"] ?? null,
      at: Date.now(),
    });

    // Key validation.
    if (path === "/v1/project" || path === "/api/v1/api/project") {
      const delay = nextProjectDelayMs;
      nextProjectDelayMs = 0;
      if (delay > 0) {
        return setTimeout(() => send(res, 200, { id: 42, name: "Gate-E Mock Project" }), delay);
      }
      return send(res, 200, { id: 42, name: "Gate-E Mock Project" });
    }
    if (path === "/v1/project/locales") {
      const responseBytes = nextLocalesResponseBytes;
      nextLocalesResponseBytes = 0;
      if (responseBytes > 0) return sendLargeJson(res, responseBytes);
      return send(res, 200, { sourceLocale: "en", locales: [{ code: "en" }] });
    }
    if (path === "/v1/translations") {
      return send(res, 200, { namespaces: {} });
    }
    if (path.startsWith("/v1/keys/")) {
      return send(res, req.method === "DELETE" ? 200 : 404, {});
    }
    if (path === "/v1/keys") {
      return send(res, 200, {
        id: 1,
        key: "x",
        namespaceId: 1,
        namespace: "common",
        isPlural: false,
        createdAt: "",
        updatedAt: "",
        translations: {},
      });
    }
    if (path.startsWith("/v1/context/")) {
      return send(res, 200, { entries: [], updated: [], resend: [] });
    }
    if (path.includes("/export")) {
      return send(res, 200, {});
    }
    // Any other /v1 or /api path: the SW should NEVER let these through, but
    // if one arrives we log + 200 it so the harness can flag the leak loudly.
    return send(res, 200, { LEAKED: true, path });
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[gate-e] mock API + hostile page on http://${HOST}:${PORT}`);
});
