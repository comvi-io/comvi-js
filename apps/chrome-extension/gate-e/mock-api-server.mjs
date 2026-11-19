/**
 * Gate-E mock API + static server.
 *
 * Serves the hostile page at `/`, the Comvi 0.8 site pages below, the built
 * `@comvi/core` dist they import, and answers the editor's API routes so the
 * extension can reach an *active* session without the real backend or a real
 * key. Crucially, it is the GROUND TRUTH for egress: every `/v1/*` request the
 * service worker makes is logged with its Authorization header. The pages read
 * `/__log` (same origin) to assert what reached the API.
 *
 * The API side is a small platform: one project whose keys live in `store`.
 * `GET /v1/keys/:ns/:key` reads it, `PUT /v1/keys` writes it, and
 * `/catalog/:locale/:ns.json` serves it as nested JSON, the way a CDN serves a
 * published catalog — so a saved value is what a later catalog load returns.
 *
 * Run: node gate-e/mock-api-server.mjs   (listens on 127.0.0.1:8791)
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, sep } from "node:path";

const HOST = "127.0.0.1";
const PORT = 8791;
const DIR = dirname(fileURLToPath(import.meta.url));
// The built ES modules of @comvi/core. Core 0.8 builds no global bundle: the
// pages import these, and `/core2/` serves the same files under another URL —
// a second copy of core, with its own module instances.
const CORE_DIST = join(DIR, "../../../packages/core/dist");
const FIXTURES = join(DIR, "fixtures");

const CDN_ALLOWED = "script-src 'self' https://cdn.jsdelivr.net";

/**
 * Site pages. None has an inline script or style, so each can be served under a
 * strict Content-Security-Policy.
 * @type {Record<string, {body: string, scripts: string[], csp?: string}>}
 */
const SITE_PAGES = {
  // @comvi/core 0.8 with devtools(): the target pairing.
  "/app": { body: "app", scripts: ["/fixtures/app.js"] },
  // The CDN is not allowed: the load is blocked by script-src.
  "/app-csp-script": { body: "app", scripts: ["/fixtures/app.js"], csp: "script-src 'self'" },
  // The editor may load, inline styles may not: it must still render styled.
  "/app-csp-style": {
    body: "app",
    scripts: ["/fixtures/app.js"],
    csp: `${CDN_ALLOWED}; style-src 'self'`,
  },
  // Trusted Types without a policy: the core's `src` assignment is refused.
  "/app-tt-none": {
    body: "app",
    scripts: ["/fixtures/app.js"],
    csp: `${CDN_ALLOWED}; require-trusted-types-for 'script'`,
  },
  // Trusted Types with a `default` policy for the editor URL, and `vue`, the policy the
  // editor's Vue runtime creates for its HTML.
  "/app-tt-policy": {
    body: "app",
    scripts: ["/fixtures/tt-policy.js", "/fixtures/app.js"],
    csp: `${CDN_ALLOWED}; require-trusted-types-for 'script'; trusted-types default vue`,
  },
  // An incompatible page: `?shape=old|registry|hook|p3|kind` (fixtures/incompatible.js).
  "/incompatible": { body: "app", scripts: ["/fixtures/incompatible.js"] },
  // A site that never composed devtools(): nothing to detect.
  "/no-devtools": { body: "app", scripts: ["/fixtures/plain.js"] },
  // Marker layout measurements (fixtures/layout.js).
  "/layout": { body: "layout", scripts: ["/fixtures/layout.js"] },
};

const BODIES = {
  app: [
    '<button id="counter" type="button">Count</button>',
    '<section id="region-A" class="region">',
    '<h1 id="A-title" data-k="home.title"></h1>',
    '<p id="A-nested" data-k="nav.about"></p>',
    '<p id="A-fallback" data-k="only.en"></p>',
    '<p id="A-missing" data-k="missing.key"></p>',
    '<p id="A-common" data-k="save" data-ns="common"></p>',
    '<p id="A-rich" data-k="rich.terms" data-rich></p>',
    '<div id="route"></div>',
    "</section>",
    '<section id="region-B" class="region"><h1 id="B-title" data-k="home.title"></h1></section>',
    '<section id="region-C" class="region"><h1 id="C-title" data-k="home.title"></h1></section>',
  ],
  layout: ['<main id="cases"></main>'],
};

function sitePage({ body, scripts }) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<title>Comvi Gate-E — site</title>",
    '<link rel="stylesheet" href="/fixtures/site.css" />',
    "</head>",
    "<body>",
    ...BODIES[body],
    ...scripts.map((src) => `<script type="module" src="${src}"></script>`),
    "</body>",
    "</html>",
  ].join("\n");
}

// --- the platform: one project, its keys by namespace → key → locale ---

const SEED = {
  default: {
    "home.title": { en: "Welcome home", de: "Willkommen" },
    "nav.about": { en: "About us", de: "Über uns" },
    "only.en": { en: "Only in English" },
    "rich.terms": { en: "Read the <b>terms</b> now", de: "Lies die <b>Bedingungen</b> jetzt" },
    "gate.select": {
      en: "{gender, select, male {{count, plural, one {He has # item} other {He has # items}}} female {{count, plural, one {She has # item} other {She has # items}}}}",
    },
  },
  common: { save: { en: "Save", de: "Speichern" } },
  about: { "about.title": { en: "About this site", de: "Über diese Seite" } },
};

/** Catalogs of the other regions' instances (`en-B`, `en-C`): not keys of the project. */
const REGION_CATALOGS = {
  "en-B/default": { "home.title": "Second home" },
  "en-B/common": { save: "Save B" },
  "en-C/default": { "home.title": "Third home" },
  "en-C/common": { save: "Save C" },
};

/** @type {Record<string, Record<string, Record<string, string>>>} */
let store = structuredClone(SEED);

/** A flat key → value catalog of (locale, ns), nested at every dot, as a CDN serves it. */
function catalog(locale, ns) {
  const flat =
    REGION_CATALOGS[`${locale}/${ns}`] ??
    Object.fromEntries(
      Object.entries(store[ns] ?? {})
        .filter(([, values]) => values[locale] !== undefined)
        .map(([key, values]) => [key, values[locale]]),
    );
  const nested = {};
  for (const [key, value] of Object.entries(flat)) {
    const path = key.split(".");
    let at = nested;
    for (const part of path.slice(0, -1)) at = at[part] ??= {};
    at[path.at(-1)] = value;
  }
  return nested;
}

function keyRecord(ns, key) {
  const values = store[ns]?.[key];
  if (!values) return null;
  const meta = { id: 1, status: "translated", createdAt: "", updatedAt: "" };
  return {
    id: 1,
    key,
    namespaceId: 1,
    namespace: ns,
    isPlural: /plural/.test(Object.values(values).join("")),
    createdAt: "",
    updatedAt: "",
    translations: Object.fromEntries(
      Object.entries(values).map(([locale, value]) => [locale, { ...meta, value }]),
    ),
  };
}

/** @type {{method:string,path:string,auth:string|null,body:string|null,at:number}[]} */
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
/** How many of the next `PUT /v1/keys` answer 500 (the API-error-and-retry scenario). */
let failSaves = 0;

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

/** A file under `root`, or null: no path may climb out of it. */
function fileUnder(root, relative) {
  const path = normalize(join(root, relative));
  return path.startsWith(root + sep) && existsSync(path) ? path : null;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") return send(res, 204, "");

  // --- pages and the code they load ---
  if (path === "/" || path === "/index.html") {
    return send(res, 200, readFileSync(join(DIR, "hostile-page.html"), "utf8"), {
      "Content-Type": "text/html; charset=utf-8",
    });
  }
  // `/app/<route>` is the same app after a client navigation (a reload lands there).
  const page = SITE_PAGES[path] ?? (path.startsWith("/app/") ? SITE_PAGES["/app"] : undefined);
  if (page) {
    return send(res, 200, sitePage(page), {
      "Content-Type": "text/html; charset=utf-8",
      ...(page.csp ? { "Content-Security-Policy": page.csp } : {}),
    });
  }
  const code =
    path.startsWith("/core/") || path.startsWith("/core2/")
      ? fileUnder(CORE_DIST, path.slice(path.indexOf("/", 1) + 1))
      : path.startsWith("/fixtures/")
        ? fileUnder(FIXTURES, path.slice("/fixtures/".length))
        : null;
  if (code) {
    // Read per request: a missing build must fail the page load, loudly.
    return send(res, 200, readFileSync(code, "utf8"), {
      "Content-Type": code.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "application/javascript; charset=utf-8",
    });
  }
  if (path.startsWith("/core/") || path.startsWith("/core2/") || path.startsWith("/fixtures/")) {
    return send(res, 404, { error: `not built: ${path}` });
  }
  const catalogPath = /^\/catalog\/([\w-]+)\/([\w-]+)\.json$/.exec(path);
  if (catalogPath) {
    return send(res, 200, catalog(catalogPath[1], catalogPath[2]));
  }

  // --- harness bookkeeping (not part of the API surface) ---
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
    failSaves = 0;
    store = structuredClone(SEED);
    return send(res, 200, { ok: true });
  }
  if (path === "/__store") {
    return send(res, 200, store);
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
    const saves = Number(url.searchParams.get("failSaves"));
    if (Number.isFinite(projectDelay) && projectDelay >= 0) nextProjectDelayMs = projectDelay;
    if (Number.isFinite(localesBytes) && localesBytes >= 0) {
      nextLocalesResponseBytes = localesBytes;
    }
    if (Number.isFinite(saves) && saves >= 0) failSaves = saves;
    return send(res, 200, { nextProjectDelayMs, nextLocalesResponseBytes, failSaves });
  }

  // --- mocked API surface: log EVERYTHING that reaches /v1 or /api ---
  if (path.startsWith("/v1/") || path.startsWith("/api/")) {
    const body = req.method === "PUT" || req.method === "POST" ? await readBody(req) : null;
    apiLog.push({
      method: req.method,
      path: path + url.search,
      auth: req.headers["authorization"] ?? null,
      body,
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
      return send(res, 200, {
        sourceLocale: "en",
        locales: [
          { code: "en", name: "English" },
          { code: "de", name: "German" },
        ],
      });
    }
    // The editor's refresh on activation: nothing newer than the catalogs.
    if (path === "/v1/translations") {
      return send(res, 200, { locales: [], namespaces: {} });
    }
    const keyPath = /^\/v1\/keys\/([^/]+)\/([^/]+)$/.exec(path);
    if (req.method === "GET" && keyPath) {
      const record = keyRecord(decodeURIComponent(keyPath[1]), decodeURIComponent(keyPath[2]));
      return record ? send(res, 200, record) : send(res, 404, { error: "not found" });
    }
    if (keyPath) {
      return send(res, req.method === "DELETE" ? 200 : 404, {});
    }
    if (path === "/v1/keys" && req.method === "PUT") {
      if (failSaves > 0) {
        failSaves -= 1;
        return send(res, 500, { error: "mock platform failure" });
      }
      let payload;
      try {
        payload = JSON.parse(body ?? "");
      } catch {
        return send(res, 400, { error: "bad json" });
      }
      const values = ((store[payload.namespace] ??= {})[payload.key] ??= {});
      for (const [locale, entry] of Object.entries(payload.translations ?? {})) {
        values[locale] = entry.value;
      }
      return send(res, 200, keyRecord(payload.namespace, payload.key));
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
