/**
 * Gate-E mock API + static server.
 *
 * Serves the hostile page at `/`, the honest site pages below, and answers the
 * editor's API routes so the
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
// The built UMD global of @comvi/core: the pages run the real SDK, whose
// devtools capability installs the editor-loader hook the extension calls.
const CORE_GLOBAL = join(DIR, "../../../packages/core/dist/comvi-core.global.prod.js");

/**
 * Site pages: a Comvi site with no inline script or style, so each can be
 * served under a strict Content-Security-Policy.
 * @type {Record<string, {scripts: string[], csp?: string}>}
 */
const SITE_PAGES = {
  // @comvi/core with devtools(): the target pairing.
  "/site": { scripts: ["/__core.js", "/site.js"] },
  // jsDelivr is not allowed: the hook reports csp-blocked.
  "/csp-script": { scripts: ["/__core.js", "/site.js"], csp: "script-src 'self'" },
  // The editor may load, inline styles may not: it must still render styled.
  "/csp-style": {
    scripts: ["/__core.js", "/site.js"],
    csp: "script-src 'self' https://cdn.jsdelivr.net; style-src 'self'",
  },
  // @comvi/core 0.5.0: announced on window.__COMVI__, no editor-loader hook.
  "/old-sdk": { scripts: ["/old-sdk-site.js"] },
  // A site that never composed devtools(): nothing to detect.
  "/no-devtools": { scripts: [] },
};

function sitePage(scripts) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8" /><title>Comvi Gate-E — site</title></head>',
    '<body><h1 id="greeting">Gate E site</h1>',
    ...scripts.map((src) => `<script src="${src}"></script>`),
    "</body></html>",
  ].join("\n");
}

/** @type {{method:string,path:string,auth:string|null,at:number}[]} */
const apiLog = [];
let nextProjectDelayMs = 0;
/**
 * Hold-and-release for the next key validation, so a spec can sequence a race
 * on observed state instead of wall-clock delays: `holdNextProject=1` parks
 * the next /v1/project response until `/__release`; `/__held` reports whether
 * one is parked and how many held responses were delivered.
 */
let holdNextProject = false;
/** @type {(() => void) | null} */
let releaseHeldProject = null;
let heldProjectsDelivered = 0;
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
  if (SITE_PAGES[path]) {
    const { scripts, csp } = SITE_PAGES[path];
    return send(res, 200, sitePage(scripts), {
      "Content-Type": "text/html; charset=utf-8",
      ...(csp ? { "Content-Security-Policy": csp } : {}),
    });
  }
  if (path === "/__core.js" || path === "/site.js" || path === "/old-sdk-site.js") {
    // Read per request: a missing build must fail the page load, loudly.
    const file = path === "/__core.js" ? CORE_GLOBAL : join(DIR, path.slice(1));
    return send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/javascript; charset=utf-8",
    });
  }
  if (path === "/__log") {
    return send(res, 200, { requests: apiLog });
  }
  if (path === "/__reset") {
    apiLog.length = 0;
    nextProjectDelayMs = 0;
    holdNextProject = false;
    // Detach before invoking, so the release cannot observe itself as held.
    const release = releaseHeldProject;
    releaseHeldProject = null;
    release?.();
    heldProjectsDelivered = 0;
    nextLocalesResponseBytes = 0;
    return send(res, 200, { ok: true });
  }
  if (path === "/__held") {
    return send(res, 200, { held: releaseHeldProject !== null, delivered: heldProjectsDelivered });
  }
  if (path === "/__release") {
    const release = releaseHeldProject;
    releaseHeldProject = null;
    release?.();
    return send(res, 200, { released: Boolean(release) });
  }
  if (path === "/__config") {
    if (url.searchParams.get("holdNextProject") === "1") holdNextProject = true;
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
      if (holdNextProject) {
        holdNextProject = false;
        releaseHeldProject = () => {
          send(res, 200, { id: 42, name: "Gate-E Mock Project" });
          heldProjectsDelivered += 1;
        };
        return;
      }
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
      return send(res, 200, { sourceLocale: "en", locales: [{ code: "en", name: "English" }] });
    }
    if (path === "/v1/translations") {
      return send(res, 200, { namespaces: {} });
    }
    // One existing key with select forms, so the edit modal shows its Preset
    // dropdown (the site pages render it).
    if (req.method === "GET" && /^\/v1\/keys\/[^/]+\/gate\.select$/.test(path)) {
      const value =
        "{gender, select, male {{count, plural, one {He has # item} other {He has # items}}} female {{count, plural, one {She has # item} other {She has # items}}}}";
      const meta = { id: 1, status: "translated", createdAt: "", updatedAt: "" };
      return send(res, 200, {
        id: 1,
        key: "gate.select",
        namespaceId: 1,
        namespace: "common",
        isPlural: true,
        createdAt: "",
        updatedAt: "",
        translations: { en: { ...meta, value } },
      });
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
