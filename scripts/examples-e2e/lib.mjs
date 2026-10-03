import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

/**
 * The parts of `examples:e2e` that do not need a browser, a build or an
 * install, kept apart from `run.mjs` so they can be unit-tested
 * (`lib.test.mjs`): argument parsing, port choice, the mock CDN's URL layout,
 * how a server is started per kind, and the result table.
 */

/** The scenario's steps, in the order the spec runs and the table prints them. */
export const STEPS = ["a", "b", "c", "d", "e", "f", "g"];

/** What each step asserts, printed under the table so a column letter is never a riddle. */
export const STEP_LEGEND = {
  a: "initial render shows real text, no raw keys",
  b: "switcher en → uk → de changes the greeting",
  c: "plural 0/1/2/5 in en, uk (one/few/many) and de",
  d: "<T> renders a real <a href> with translated text",
  e: "catalogs load lazily, one per visited locale",
  f: "SSR: plain-HTTP /uk already translated, then hydrates (next, nuxt only)",
  g: "no console errors during the run",
};

export function parseArgs(argv) {
  const options = { only: [], cdn: false, build: true, pack: true, keep: false, headed: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--only") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--only needs a framework name");
      options.only.push(...value.split(",").filter(Boolean));
    } else if (arg.startsWith("--only=")) {
      options.only.push(...arg.slice("--only=".length).split(",").filter(Boolean));
    } else if (arg === "--cdn") options.cdn = true;
    else if (arg === "--no-build") options.build = false;
    else if (arg === "--no-pack") options.pack = false;
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--headed") options.headed = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/**
 * A port nothing is listening on right now, chosen by the OS.
 *
 * Port 0 rather than a fixed range: seven servers plus the mock CDN, run while
 * a reader may have their own dev server on 3000 or 5173, is exactly where a
 * hard-coded port collides. There is a window between closing this probe and
 * the real server binding, so every server is also started with its own
 * "fail if taken" flag (`--strictPort` for Vite) and the runner reports that
 * failure instead of silently testing whatever answered.
 */
export function freePort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

/** A path segment the platform CDN could serve: no dots, no slashes, no traversal. */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * The platform CDN layout, inverted: which catalog a request path asks for.
 *
 * `@comvi/plugin-fetch-loader`'s `buildCdnUrl` writes
 *   - `{cdnUrl}/{locale}.json` for the default namespace, and
 *   - `{cdnUrl}/{namespace}/{locale}.json` for every other one,
 * so this reads those two shapes back, relative to the mock's own `base`
 * path, and answers `null` for anything else. `null` is a 404, never a guess.
 */
export function cdnRoute(pathname, base, defaultNs = "default") {
  const prefix = base.endsWith("/") ? base : `${base}/`;
  if (!pathname.startsWith(prefix)) return null;
  const parts = pathname.slice(prefix.length).split("/");
  if (parts.length === 1) {
    const match = /^(.+)\.json$/.exec(parts[0]);
    if (!match || !SEGMENT.test(match[1])) return null;
    return { locale: match[1], namespace: defaultNs };
  }
  if (parts.length === 2) {
    const match = /^(.+)\.json$/.exec(parts[1]);
    if (!match || !SEGMENT.test(parts[0]) || !SEGMENT.test(match[1])) return null;
    // `{cdnUrl}/default/en.json` is not a URL the loader ever builds: the
    // default namespace is served from the root. Refusing it keeps the mock
    // exactly as strict as the layout.
    if (parts[0] === defaultNs) return null;
    return { locale: match[1], namespace: parts[0] };
  }
  return null;
}

/**
 * Where a routed catalog lives in `examples/locales`.
 *
 * The shared catalogs are the default namespace (`en.json`, `uk.json`,
 * `de.json`); a namespace `ns` would live in `ns/<locale>.json`, mirroring the
 * CDN, so adding one needs no change here.
 */
export function catalogFile(localesDir, route, defaultNs = "default") {
  return route.namespace === defaultNs
    ? path.join(localesDir, `${route.locale}.json`)
    : path.join(localesDir, route.namespace, `${route.locale}.json`);
}

/**
 * A static server for `examples/locales` in the platform CDN layout.
 *
 * Every request is logged, so the runner can prove afterwards that an example
 * built for the CDN really read its catalogs from here — a `--cdn` run whose
 * env var silently did not apply would otherwise pass on the bundled import
 * map. CORS is open because the Vite examples fetch it cross-origin, exactly
 * as a browser fetches the real CDN.
 */
export async function startMockCdn({ localesDir, base = "/cdn/e2e", host = "127.0.0.1" }) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://mock").pathname;
    const route = cdnRoute(pathname, base);
    const file = route ? catalogFile(localesDir, route) : null;
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "cache-control": "no-store",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers).end();
      return;
    }
    const found = file !== null && fs.existsSync(file);
    requests.push({ pathname, status: found ? 200 : 404, route });
    if (!found) {
      res.writeHead(404, { ...headers, "content-type": "text/plain" }).end("not found");
      return;
    }
    res
      .writeHead(200, { ...headers, "content-type": "application/json; charset=utf-8" })
      .end(fs.readFileSync(file));
  });
  const port = await freePort(host);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    url: `http://${host}:${port}${base}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * The `cdn` column: did this example read every locale's catalog from the mock?
 *
 * `requests` is the slice of the mock's log taken while this one example was
 * built and exercised. Next prerenders `/en`, `/uk` and `/de` during
 * `next build`, so for it the catalogs arrive at BUILD time; that is why the
 * slice starts before the build and not at server start.
 */
export function cdnVerdict(requests, locales = ["en", "uk", "de"]) {
  const served = new Set(
    requests
      .filter((entry) => entry.status === 200 && entry.route)
      .map((entry) => entry.route.locale),
  );
  const missing = locales.filter((locale) => !served.has(locale));
  const notFound = requests.filter((entry) => entry.status !== 200).map((entry) => entry.pathname);
  if (missing.length === 0 && notFound.length === 0) return { ok: true };
  const parts = [];
  if (missing.length > 0) {
    parts.push(
      `the mock CDN never served ${missing.join(", ")} (served: ${[...served].join(", ") || "nothing"})`,
    );
  }
  if (notFound.length > 0) parts.push(`404 for ${[...new Set(notFound)].join(", ")}`);
  return { ok: false, message: parts.join("; ") };
}

/**
 * How a reader starts the BUILT app, per kind: the command, its arguments and
 * its environment. A reader's commands, on purpose — `vite preview`,
 * `next start`, Nitro's own server entry — so the scenario runs against what
 * would actually be deployed rather than a dev server.
 */
export function serverCommand(kind, { dir, port, host = "127.0.0.1", env = {} }) {
  const bin = (name) => path.join(dir, "node_modules", ".bin", name);
  if (kind === "vite") {
    return {
      command: bin("vite"),
      args: ["preview", "--host", host, "--port", String(port), "--strictPort"],
      env,
    };
  }
  if (kind === "next") {
    return { command: bin("next"), args: ["start", "-H", host, "-p", String(port)], env };
  }
  if (kind === "nuxt") {
    return {
      command: process.execPath,
      args: [path.join(dir, ".output", "server", "index.mjs")],
      env: { ...env, HOST: host, PORT: String(port), NITRO_HOST: host, NITRO_PORT: String(port) },
    };
  }
  throw new Error(`no server command for kind "${kind}"`);
}

/**
 * The "Connect to Comvi" switch, per kind: the variable each example reads to
 * compose `cdnLoader` instead of its import map. Vite and Next inline theirs
 * at BUILD time; Nuxt reads runtime config, so the runner sets it for the
 * build and for the server alike.
 */
export function cdnEnv(kind, cdnUrl) {
  if (kind === "vite") return { VITE_COMVI_CDN_URL: cdnUrl };
  if (kind === "next") return { NEXT_PUBLIC_COMVI_CDN_URL: cdnUrl };
  if (kind === "nuxt") return { NUXT_PUBLIC_COMVI_CDN_URL: cdnUrl };
  throw new Error(`no CDN switch for kind "${kind}"`);
}

/** Where the scenario starts: SSR examples carry the locale in the URL. */
export function startPath(kind) {
  return kind === "vite" ? "/" : "/en";
}

/**
 * Per-step results out of Playwright's JSON report.
 *
 * Each test title starts with its step letter (`"a: …"`). The first error's
 * first lines are kept, so a failing cell can say WHICH assertion failed
 * without pasting a stack trace into the table.
 */
export function stepResults(report) {
  const out = {};
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const step = /^([a-z])\b/.exec(spec.title)?.[1];
      if (!step) continue;
      for (const test of spec.tests ?? []) {
        const result = test.results?.[test.results.length - 1];
        const status = result?.status ?? test.status ?? "unknown";
        const error = result?.errors?.[0]?.message ?? result?.error?.message;
        out[step] = {
          status: status === "passed" ? "pass" : status === "skipped" ? "skip" : "fail",
          message: error ? summarizeError(error) : status === "passed" ? undefined : status,
        };
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report?.suites ?? []) visit(suite);
  return out;
}

/** The ANSI-free first meaningful lines of a Playwright error. */
export function summarizeError(message, maxLength = 300) {
  // eslint-disable-next-line no-control-regex
  const plain = message.replace(/\u001b\[[0-9;]*m/g, "");
  const lines = plain
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(at |Call log:|- )/.test(line))
    // Diff scaffolding carries no information; the values inside it do.
    .filter((line) => !/^[+-]?\s*(Expected|Received)\b.*\+\s*\d+$/.test(line))
    .filter((line) => !/^[+-]?\s*(Array \[|\])$/.test(line));
  const text = lines.slice(0, 4).join(" | ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

const CELL = { pass: "ok", fail: "FAIL", skip: "—" };

/**
 * The report: one row per framework, one column per step, and the failing
 * assertion text listed underneath, keyed `framework/column`.
 *
 * `result` shape: `{ name, build: {status, message?}, steps: {a: {...}, …},
 * cdn: {status, message?} | null }`. A step that never ran because the build
 * failed has no entry and prints as `·`, which is not the same thing as a
 * skip.
 */
export function renderTable(results, { cdn = false } = {}) {
  const header = ["framework", "build", ...STEPS, "cdn"];
  const failures = [];
  const rows = results.map((result) => {
    // One line per distinct message: a server that never came up fails every
    // step with the same cause, and seven copies of it bury the next failure.
    const byMessage = new Map();
    const cell = (column, entry) => {
      if (!entry) return "·";
      if (entry.status === "fail" && entry.message) {
        byMessage.set(entry.message, [...(byMessage.get(entry.message) ?? []), column]);
      }
      return CELL[entry.status] ?? entry.status;
    };
    const row = [
      result.name,
      cell("build", result.build),
      ...STEPS.map((step) => cell(step, result.steps?.[step])),
      cdn ? cell("cdn", result.cdn) : "—",
    ];
    for (const [message, columns] of byMessage) {
      failures.push(`${result.name}/${columns.join(",")}: ${message}`);
    }
    return row;
  });
  const widths = header.map((h, index) =>
    Math.max(h.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells) =>
    cells
      .map((value, index) => value.padEnd(widths[index]))
      .join("  ")
      .trimEnd();
  const table = [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)];
  const legend = [
    "",
    ...STEPS.map((step) => `${step}  ${STEP_LEGEND[step]}`),
    `cdn  ${cdn ? "every catalog came from the mock CDN (--cdn)" : "not run; pass --cdn"}`,
    "ok = passed, FAIL = failed, — = not applicable, · = not reached",
  ];
  return [...table, ...legend, ...(failures.length ? ["", "failures:", ...failures] : [])].join(
    "\n",
  );
}

/** Whether a whole run is green: every build and every step that ran passed. */
export function allPassed(results, { cdn = false } = {}) {
  return results.every(
    (result) =>
      result.build?.status === "pass" &&
      STEPS.every((step) => result.steps?.[step] && result.steps[step].status !== "fail") &&
      (!cdn || result.cdn?.status === "pass"),
  );
}
