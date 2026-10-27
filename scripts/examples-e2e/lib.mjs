import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import { packedManifest } from "./candidate-registry.mjs";

/**
 * The parts of `examples:e2e` that do not need a browser, a build or an
 * install, kept apart from `run.mjs` so they can be unit-tested
 * (`lib.test.mjs`): argument parsing, port choice, the mock CDN's URL layout,
 * how a server is started per kind, and the result table.
 */

/**
 * The scenario's steps, in the order the table prints them. `k` is the
 * runner's own verdict on the mock CDN's request log; `g2` is step `g`'s test
 * run again in the dead-CDN phase; every other step is a test in
 * `scenario.spec.ts` whose title starts with its id.
 */
export const STEPS = [
  "a",
  "a2",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "g2",
  "h",
  "i",
  "j",
  "k",
  "k2",
  "k3",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "t2",
  "u",
  "v",
  "v2",
  "w",
  "x",
  "y",
  "z",
];

/**
 * The steps that steer the mock CDN (`--cdn` only). Each runs in its own
 * Playwright run against a FRESH server of the main build: Next's host is
 * process-wide and keeps every catalog it ever loaded, so a second race on
 * the same server would find uk and de cached and race nothing.
 */
export const CDN_CONTROL_STEPS = ["t", "t2", "u", "v", "v2"];

/**
 * `sveltekit` and `solidstart` are the docs' SSR recipes as apps, not the
 * feature gallery: they run `ssr-recipe.spec.ts` and get a table of their own.
 * `f` is the runner's own `pnpm run typecheck`; every other step is a test.
 */
export const RECIPE_KINDS = ["sveltekit", "solidstart"];

export const RECIPE_STEPS = ["a", "a2", "b", "c", "d", "e", "e2", "f"];

export const RECIPE_LEGEND = {
  a: "SSR: plain-HTTP /, /uk, /de, /ar, /about and /uk/about are translated, with <html lang dir>; with JavaScript off the text is on screen",
  a2: "a again on the PRESSURE build, where loading the catalogs takes 10 ms: still text in the HTML, not a streamed placeholder (SolidStart streams; SvelteKit awaits load either way)",
  b: "hydration: /uk is only ever Ukrainian from first paint on, then the counter answers clicks",
  c: "after hydration, client navigation / → /about → / → /uk → /uk/about → /ar/about → /ar → /de → / and Back twice, in one document: text, lang and dir follow",
  d: "an unknown first or second segment (/xx, /xx/about, /en-US, /uk/xx) answers 404; /about, /en and /en/about are English",
  e: "on the PRESSURE build, 100 concurrent requests across en, uk, de and ar each render their own locale",
  e2: "negative control: the SHARED build (one instance for every request) renders each locale right one at a time, then the burst renders some responses in another request's locale",
  f: "the example's own typecheck (svelte-check, tsc)",
};

export const isRecipe = (kind) => RECIPE_KINDS.includes(kind);

/** The columns a result is judged on: the gallery's or the recipes'. */
export const stepsFor = (kind) => (isRecipe(kind) ? RECIPE_STEPS : STEPS);

/** What each step asserts, printed under the table so a column id is never a riddle. */
export const STEP_LEGEND = {
  a: "initial render shows real text, no raw keys",
  a2: "the instance is published on window.__COMVI__, where the browser extension finds it, as { v, i, x } with the protocol-2 handle",
  b: "switcher en → uk → de changes the greeting",
  c: "plural 0/1/2/5 in en, uk (one/few/many) and de",
  d: "<T> renders a real <a href> with translated text",
  e: "catalogs load lazily, one per visited locale",
  f: "SSR: plain-HTTP /uk already translated, then hydrates",
  g: "no console.error or uncaught error in g's own pass (every step also fails on its own)",
  g2: "--cdn: the same in the dead-CDN phase, past a narrow allowlist of network messages",
  h: "a second page is translated and the locale survives navigation and Back",
  i: "locale in the URL: /de renders German, switching navigates, Back restores",
  j: "a locale's catalog is requested only when first needed, then renders",
  k: "--cdn: every catalog came from the mock CDN, nothing 404'd",
  k2: "--cdn: CDN unreachable → the bundled `fallback` imports serve the catalogs",
  k3: "--cdn: the CDN's uk bundle lacks a key → the en value renders, not the key",
  l: "fallbackLocale: en-only key renders en under uk; unknown key renders as itself",
  m: "persistence: reload keeps uk; a fresh de browser starts in de",
  n: "<html lang dir> follow the locale, dir=rtl for ar",
  o: "SSR: the greeting text is right from first paint through hydration",
  p: "a missing parameter renders as its own placeholder",
  q: "an HTML-like parameter renders as text: no element, no handler run",
  r: "every DOM state (one per delivered mutation batch) during en → uk → de is one whole language: never a raw key or a mix",
  s: "F-15: defaultLocale uk, /uk renders the en value of an en-only key, SSR and hydrated",
  t: "--cdn SSR race: /uk and /de held in flight together, uk released first; each HTML and its hydration in its own locale",
  t2: "--cdn SSR race: the same, de released first",
  u: "--cdn client race: en → uk → de with uk's catalog answered LAST (vue, nuxt: their binding queues switches, so de is requested only after uk; react, vanilla: the 0.8 core aborts uk's request when de is chosen); the UI stays de",
  v: "--cdn: uk's catalog request hangs → after the loader's timeout the bundled uk renders",
  v2: "--cdn: uk's catalog is corrupt JSON → the bundled uk renders",
  w: "namespace: the first page never requests `account`; the second page loads `en:account` once and renders it",
  x: "namespace: every DOM state of the second page during en → uk → de is one whole language, `account` included; its en-only key renders en",
  y: "SSR: plain-HTTP /uk/about already carries the `account` text, then hydrates without changing it or refetching the catalog",
  z: "--cdn: CDN unreachable → the bundled `locale:account` fallback imports serve the namespace",
};

export function parseArgs(argv) {
  const options = {
    only: [],
    cdn: false,
    build: true,
    pack: true,
    keep: false,
    headed: false,
    tarballs: null,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--only") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--only needs a framework name");
      options.only.push(...value.split(",").filter(Boolean));
    } else if (arg.startsWith("--only=")) {
      options.only.push(...arg.slice("--only=".length).split(",").filter(Boolean));
    } else if (arg === "--tarballs" || arg.startsWith("--tarballs=")) {
      const value = arg === "--tarballs" ? argv[++index] : arg.slice("--tarballs=".length);
      if (!value || value.startsWith("--")) throw new Error("--tarballs needs a directory");
      options.tarballs = value;
    } else if (arg === "--cdn") options.cdn = true;
    else if (arg === "--no-build") options.build = false;
    else if (arg === "--no-pack") options.pack = false;
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--headed") options.headed = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  // A candidate's tarballs are the thing under test: building or packing
  // would replace them with something else.
  if (options.tarballs) {
    options.build = false;
    options.pack = false;
  }
  return options;
}

/**
 * A port nothing is listening on right now, chosen by the OS.
 *
 * Port 0 rather than a fixed range: nine servers plus the mock CDN, run while
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
 * The catalogs at the root are the default namespace (`en.json`, `uk.json`,
 * `de.json`); a namespace lives in `<namespace>/<locale>.json`, as `account`
 * does, mirroring the CDN.
 */
export function catalogFile(localesDir, route, defaultNs = "default") {
  return route.namespace === defaultNs
    ? path.join(localesDir, `${route.locale}.json`)
    : path.join(localesDir, route.namespace, `${route.locale}.json`);
}

/**
 * What the mock CDN prepends to every message it serves.
 *
 * The bundled catalogs and the CDN must not say the same thing, or "the page
 * shows the right text" cannot tell which of the two the app read: a CDN that
 * silently failed and an app quietly on its `fallback` imports would pass every
 * text assertion. With the mark, the CDN's uk greeting is
 * `[CDN] Привіт, Ada!…` and the bundled one is `Привіт, Ada!…`, so a
 * successful `--cdn` run must show the mark and the dead-CDN phase must not.
 * A plain prefix, because the ICU and tag grammars give `[` and `]` no meaning.
 */
export const CDN_MARK = "[CDN] ";

/**
 * Keys the CDN's bundle for a locale lacks, whatever the bundled catalog says.
 *
 * Step k3 needs a key that is absent from the CDN's uk and whose en value
 * DIFFERS between the CDN and the bundle, so "uk fell back to en" can only be
 * satisfied by the CDN's en. `fallback.only_en` is absent from the bundled uk
 * too; removing it here as well makes the CDN side of that contract this
 * file's, not an accident of the demo's catalogs.
 */
export const CDN_MISSING = { uk: ["fallback.only_en"] };

/** The catalog the mock CDN serves: the bundled one, marked, minus `CDN_MISSING`. */
export function cdnCatalog(catalog, locale, missingKeys = CDN_MISSING) {
  const missing = new Set(missingKeys[locale] ?? []);
  const visit = (node, prefix) => {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (missing.has(full)) continue;
      out[key] = typeof value === "string" ? `${CDN_MARK}${value}` : visit(value, full);
    }
    return out;
  };
  return visit(catalog, "");
}

/**
 * A routed catalog under the name an import map gives it: `uk` for the default
 * namespace, `uk:account` for any other. The mock's modes, its state and its
 * release are all keyed this way, so a test can steer one namespace's file and
 * leave the same locale's default catalog alone.
 */
export function catalogKey(route, defaultNs = "default") {
  return route.namespace === defaultNs ? route.locale : `${route.locale}:${route.namespace}`;
}

/** What a corrupt catalog response carries: a body that is not JSON at all. */
export const CORRUPT_BODY = '{"greeting": {"hello": "[CDN] cut off';

/** Where the mock CDN's control surface lives, outside the catalog layout. */
export const CONTROL_PATH = "/__e2e";

/**
 * A server for `examples/locales` in the platform CDN layout, every message
 * marked by `cdnCatalog`.
 *
 * Every request is logged, so the runner can prove afterwards that an example
 * built for the CDN really read its catalogs from here — a `--cdn` run whose
 * env var silently did not apply would otherwise pass on the bundled import
 * map. CORS is open because the Vite examples fetch it cross-origin, exactly
 * as a browser fetches the real CDN.
 *
 * The tests steer it through `{origin}/__e2e` (never part of the layout):
 *
 * A catalog is named by its `catalogKey`: `uk` is the default namespace's uk
 * file, `uk:account` the `account` namespace's.
 *
 *   - `POST /__e2e/mode` with `{ hold, hang, corrupt, missing }` sets what
 *     happens to catalog requests ARRIVING from now on: a `hold` catalog's
 *     response is withheld until released; a `hang` catalog's never comes; a
 *     `corrupt` catalog gets `CORRUPT_BODY`; `missing` replaces `CDN_MISSING`.
 *     It also drops whatever the previous mode left held or hanging.
 *   - `GET /__e2e/state` answers `{ held, hanging }`: the keys of the
 *     requests in flight right now, in arrival order. A test waits on it
 *     until every request it races is provably in flight (the barrier).
 *   - `POST /__e2e/release?key=uk` answers every held request for that
 *     catalog, and itself answers once those responses are written:
 *     `{ released }`, or 409 when nothing was held under that key.
 */
export async function startMockCdn({ localesDir, base = "/cdn/e2e", host = "127.0.0.1" }) {
  const requests = [];
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "cache-control": "no-store",
  };
  const empty = () => ({ hold: [], hang: [], corrupt: [], missing: CDN_MISSING });
  let mode = empty();
  /** `{ key, send, res }` per withheld response, in arrival order. */
  let held = [];
  /** `{ key, res }` per response that will never come. */
  let hanging = [];
  const json = (res, status, body) =>
    res
      .writeHead(status, { ...headers, "content-type": "application/json" })
      .end(JSON.stringify(body));
  const drop = () => {
    for (const { res } of [...held, ...hanging]) res.destroy();
    held = [];
    hanging = [];
  };

  const control = (req, res, pathname, search) => {
    const action = pathname.slice(CONTROL_PATH.length + 1);
    if (req.method === "GET" && action === "state") {
      json(res, 200, {
        held: held.map((entry) => entry.key),
        hanging: hanging.map((entry) => entry.key),
      });
      return;
    }
    if (req.method === "POST" && action === "release") {
      const key = search.get("key");
      const releasing = held.filter((entry) => entry.key === key);
      held = held.filter((entry) => entry.key !== key);
      if (releasing.length === 0) {
        json(res, 409, { released: 0, error: `nothing held for ${key}` });
        return;
      }
      Promise.all(releasing.map((entry) => entry.send())).then(() =>
        json(res, 200, { released: releasing.length }),
      );
      return;
    }
    if (req.method === "POST" && action === "mode") {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        // A bad body is the test's mistake: answer it, never take down the
        // mock every example shares.
        let next;
        try {
          next = body ? JSON.parse(body) : {};
        } catch (error) {
          json(res, 400, { error: `the mode is not JSON: ${error.message}` });
          return;
        }
        drop();
        mode = { ...empty(), ...next, missing: next.missing ?? CDN_MISSING };
        json(res, 200, mode);
      });
      return;
    }
    json(res, 404, { error: `no control action ${req.method} ${action}` });
  };

  const server = http.createServer((req, res) => {
    const address = new URL(req.url ?? "/", "http://mock");
    const pathname = address.pathname;
    if (pathname.startsWith(`${CONTROL_PATH}/`)) {
      control(req, res, pathname, address.searchParams);
      return;
    }
    const route = cdnRoute(pathname, base);
    const file = route ? catalogFile(localesDir, route) : null;
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers).end();
      return;
    }
    const found = file !== null && fs.existsSync(file);
    const entry = { pathname, status: found ? 200 : 404, route };
    requests.push(entry);
    if (!found) {
      res.writeHead(404, { ...headers, "content-type": "text/plain" }).end("not found");
      return;
    }
    const { locale } = route;
    const key = catalogKey(route);
    if (mode.hang.includes(key)) {
      entry.status = "hang";
      hanging.push({ key, res });
      res.on("close", () => (hanging = hanging.filter((other) => other.res !== res)));
      return;
    }
    const body = mode.corrupt.includes(key)
      ? CORRUPT_BODY
      : JSON.stringify(cdnCatalog(JSON.parse(fs.readFileSync(file, "utf8")), locale, mode.missing));
    if (mode.corrupt.includes(key)) entry.corrupt = true;
    const send = () =>
      new Promise((resolve) => {
        if (res.destroyed) return resolve();
        entry.status = 200;
        res
          .writeHead(200, { ...headers, "content-type": "application/json; charset=utf-8" })
          .end(body, resolve);
      });
    if (mode.hold.includes(key)) {
      entry.status = "held";
      held.push({ key, send, res });
      res.on("close", () => (held = held.filter((other) => other.res !== res)));
      return;
    }
    send();
  });
  const port = await freePort(host);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    url: `http://${host}:${port}${base}`,
    controlUrl: `http://${host}:${port}${CONTROL_PATH}`,
    requests,
    /** Back to plain serving: no mode, nothing held or hanging. The runner calls it around every steering step. */
    reset: () => {
      drop();
      mode = empty();
    },
    close: () =>
      new Promise((resolve) => {
        drop();
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
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
  if (kind === "sveltekit") {
    return {
      command: process.execPath,
      args: [path.join(dir, "build")],
      env: { ...env, HOST: host, PORT: String(port) },
    };
  }
  if (kind === "solidstart") {
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

/**
 * The URL path of each catalog's chunk, read off Nuxt's client manifest, under
 * the catalog's import-map key: `uk` for `locales/uk.json`, `uk:account` for
 * `locales/account/uk.json`.
 *
 * Vite names a dynamic `import("./locales/uk.json")` chunk `uk-<hash>.js`, so
 * the spec can match it by name; Nuxt names chunks by hash alone, so the only
 * honest way to know which request IS the uk catalog is the manifest the build
 * wrote. `manifest` is that module's default export.
 */
export function nuxtCatalogChunks(manifest) {
  const out = {};
  for (const [key, chunk] of Object.entries(manifest ?? {})) {
    const match = /(?:^|\/)locales\/(?:([A-Za-z0-9_-]+)\/)?([A-Za-z0-9_-]+)\.json$/.exec(key);
    if (!match || !chunk?.file) continue;
    out[match[1] ? `${match[2]}:${match[1]}` : match[2]] = `/_nuxt/${chunk.file}`;
  }
  return out;
}

/**
 * Where the scenario starts: the feature gallery (`/` is a start page without
 * the tested UI), behind the locale for SSR examples. `homePath` in
 * scenario.spec.ts builds the same path for any locale. The SSR recipes have
 * one page, at `/`.
 */
export function startPath(kind) {
  if (isRecipe(kind)) return "/";
  return kind === "vite" ? "/features" : "/en/features";
}

/**
 * Per-step results out of Playwright's JSON report.
 *
 * Each test title starts with its step id (`"a: …"`, `"k2: …"`). A failure
 * keeps the first error's first lines, so the table can say WHICH assertion
 * failed without a stack trace; a skip keeps the reason the spec gave, so a
 * skipped cell is never silent.
 */
export function stepResults(report) {
  const out = {};
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const step = /^([a-z]\d?):/.exec(spec.title)?.[1];
      if (!step) continue;
      for (const test of spec.tests ?? []) {
        const result = test.results?.[test.results.length - 1];
        const status = result?.status ?? test.status ?? "unknown";
        if (status === "skipped") {
          const annotations = [...(test.annotations ?? []), ...(result?.annotations ?? [])];
          const reason = annotations.find((entry) => entry.type === "skip")?.description;
          out[step] = { status: "skip", message: reason ?? "skipped without a reason" };
          continue;
        }
        const error = result?.errors?.[0]?.message ?? result?.error?.message;
        out[step] = {
          status: status === "passed" ? "pass" : "fail",
          message: error ? summarizeError(error) : status === "passed" ? undefined : status,
        };
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report?.suites ?? []) visit(suite);
  return out;
}

/**
 * Findings a test recorded, out of Playwright's JSON report: every annotation
 * whose type is `finding:<kind>`, as `{ kind, step, ...JSON.parse(description) }`.
 * Step r records each mixed-language or raw-key DOM state it failed on this
 * way (`mixedState`), with whether a paint ran before the next state: that
 * is diagnostics for the report, never part of the verdict.
 */
export function stepFindings(report) {
  const out = [];
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const step = /^([a-z]\d?):/.exec(spec.title)?.[1];
      if (!step) continue;
      for (const test of spec.tests ?? []) {
        const result = test.results?.[test.results.length - 1];
        // A runtime annotation appears both on the test and on its result.
        const annotations = result?.annotations?.length ? result.annotations : test.annotations;
        for (const annotation of annotations ?? []) {
          const kind = /^finding:(.+)$/.exec(annotation.type ?? "")?.[1];
          if (!kind) continue;
          out.push({ kind, step, ...JSON.parse(annotation.description ?? "{}") });
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report?.suites ?? []) visit(suite);
  return out;
}

/**
 * The run's findings, grouped by kind for the report file:
 * `{ mixedStates: [{ framework, mode, phase, step, … }] }`.
 */
export function collectFindings(results, mode) {
  const findings = { mixedStates: [] };
  for (const result of results) {
    for (const finding of result.findings ?? []) {
      const { kind, ...rest } = finding;
      const entry = { framework: result.name, mode, ...rest };
      if (kind === "mixedState") findings.mixedStates.push(entry);
      else (findings[kind] ??= []).push(entry);
    }
  }
  return findings;
}

/** The findings section printed under the table; empty when there are none. */
export function renderFindings(findings) {
  const states = findings.mixedStates ?? [];
  const stalls = (findings.hydrationStall ?? []).map(
    (entry) =>
      `${entry.framework}/${entry.step} (${entry.phase}): ${entry.what} stalled after ` +
      `${entry.afterMs} ms, hydrated=${entry.hydrated}; pending: ` +
      (entry.pending
        .map((request) => `${request.method} ${request.url} (${request.ageMs} ms)`)
        .join(", ") || "none"),
  );
  const stallText = stalls.length
    ? ["", "hydration stalls (each one failed its step):", ...stalls]
    : [];
  if (states.length === 0) return stallText.join("\n");
  return [
    ...stallText,
    "",
    "mixed states (each one fails its step; painted = diagnostics only):",
    ...states.map(
      (entry) =>
        `${entry.framework}/${entry.step} (${entry.phase}): ${entry.problem}; ` +
        `lang=${entry.lang}, ${entry.field ?? "greeting"}=${JSON.stringify(entry.text)}, ` +
        `painted=${entry.painted ? "yes" : "no"}`,
    ),
  ].join("\n");
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
    // Playwright's code frame ("325 |   await open(…)", "> 325 |", "|    ^").
    .filter((line) => !/^(>\s*)?\d*\s*\|/.test(line))
    // Diff scaffolding carries no information; the values inside it do.
    .filter((line) => !/^[+-]?\s*(Expected|Received)\b.*\+\s*\d+$/.test(line))
    .filter((line) => !/^[+-]?\s*(Array \[|\])$/.test(line));
  const text = lines.slice(0, 4).join(" | ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

const CELL = { pass: "ok", fail: "FAIL", skip: "skip", xfail: "xfail" };

/**
 * The report: one row per framework, one column per step, then every failing
 * assertion and every skip reason underneath, keyed `framework/columns` and
 * listed once per distinct message.
 *
 * `result` shape: `{ name, build: {status, message?}, steps: {a: {...}, …} }`.
 * A step that never ran because the build or the server failed has no entry
 * and prints as `·`, which is not the same thing as a skip.
 */
export function renderTable(results) {
  const gallery = results.filter((result) => !isRecipe(result.kind));
  const recipes = results.filter((result) => isRecipe(result.kind));
  return [
    gallery.length || !recipes.length ? renderGroup(gallery, STEPS, STEP_LEGEND) : null,
    recipes.length ? renderGroup(recipes, RECIPE_STEPS, RECIPE_LEGEND) : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderGroup(results, steps, legendFor) {
  const header = ["framework", "build", ...steps];
  const failures = [];
  const skips = [];
  const xfails = [];
  const rows = results.map((result) => {
    const failed = new Map();
    const skipped = new Map();
    const xfailed = new Map();
    const cell = (column, entry) => {
      if (!entry) return "·";
      const bucket =
        entry.status === "fail"
          ? failed
          : entry.status === "skip"
            ? skipped
            : entry.status === "xfail"
              ? xfailed
              : null;
      if (bucket && entry.message) {
        bucket.set(entry.message, [...(bucket.get(entry.message) ?? []), column]);
      }
      return CELL[entry.status] ?? entry.status;
    };
    const row = [
      result.name,
      cell("build", result.build),
      ...steps.map((step) => cell(step, result.steps?.[step])),
    ];
    for (const [message, columns] of failed) {
      failures.push(`${result.name}/${columns.join(",")}: ${message}`);
    }
    for (const [message, columns] of skipped) {
      skips.push(`${result.name}/${columns.join(",")}: ${message}`);
    }
    for (const [message, columns] of xfailed) {
      xfails.push(`${result.name}/${columns.join(",")}: ${message}`);
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
    ...steps.map((step) => `${step.padEnd(3)} ${legendFor[step]}`),
    "ok = passed, FAIL = failed, skip = not applicable (reason below), " +
      "xfail = a listed expected failure that failed (reference below), · = not reached",
  ];
  return [
    ...table,
    ...legend,
    ...(skips.length ? ["", "skipped:", ...skips] : []),
    ...(xfails.length ? ["", "expected failures:", ...xfails] : []),
    ...(failures.length ? ["", "failures:", ...failures] : []),
  ].join("\n");
}

/**
 * Whether a whole run is green: every build passed and no step failed or went
 * unreached. An `xfail` is not a failure — `applyExpectedFailures` only writes
 * one for a listed, referenced case — and an unexpected skip never reaches
 * here as a skip: `enforceSkipMatrix` has already turned it into a failure.
 */
export function allPassed(results) {
  return results.every(
    (result) =>
      result.build?.status === "pass" &&
      stepsFor(result.kind).every(
        (step) => result.steps?.[step] && result.steps[step].status !== "fail",
      ),
  );
}

/**
 * Every skip the suite may report, per example kind and mode. A skip outside
 * this set FAILS its step (`enforceSkipMatrix`): a test that skipped because a
 * condition went wrong — an env var the runner forgot, a kind it misread —
 * would otherwise print "skip" and leave the run green.
 *
 *   - vite (the five client-rendered examples): f, i, o and y read server HTML
 *     or a locale in the URL; s is an SSR-only run variant; t and t2 race two
 *     server renders.
 *   - without --cdn: k, k2, k3, g2, z and the CDN-steering steps (t, t2, u, v,
 *     v2) are about the mock CDN.
 *   - with --cdn: s is not run (the F-15 variant runs in the bundled mode).
 *   - sveltekit, solidstart: nothing. They read bundled catalogs only, and a
 *     `--cdn` run leaves them out instead of skipping them.
 */
export function allowedSkips({ kind, cdn }) {
  const allowed = new Set();
  if (isRecipe(kind)) return allowed;
  if (kind === "vite") for (const step of ["f", "i", "o", "s", "t", "t2", "y"]) allowed.add(step);
  if (cdn) allowed.add("s");
  else for (const step of ["k", "k2", "k3", "g2", "z", ...CDN_CONTROL_STEPS]) allowed.add(step);
  return allowed;
}

/** Turn every skip `allowedSkips` does not list into a failure, in place. */
export function enforceSkipMatrix(steps, context) {
  const allowed = allowedSkips(context);
  for (const [step, entry] of Object.entries(steps)) {
    if (entry?.status === "skip" && !allowed.has(step)) {
      steps[step] = {
        status: "fail",
        message: `unexpected skip, not in the allowed-skip matrix (${entry.message})`,
      };
    }
  }
  return steps;
}

/**
 * Known defects the suite is EXPECTED to catch, each with its reference.
 *
 * This is the only way a failing step can leave a run green, and it is
 * deliberately narrow: one framework, one step, one reference, and `match`,
 * the failure message it stands for. A listed step that fails with a matching
 * message prints `xfail` with the reference; one that fails any other way
 * stays a failure; a listed step that PASSES fails
 * the run, so the entry is removed in the same change that fixes the bug and
 * cannot outlive it. A step is never skipped to hide a defect.
 */
export const EXPECTED_FAILURES = [
  // Empty. F-15 (nuxt, step s) was listed here until the F-15a fix made the
  // Nuxt server load the whole fallback chain; the step then passed, and the
  // runner failed the run until this entry was removed. An entry looks like:
  // { framework: "nuxt", step: "s", ref: "F-15", match: /fallback/, reason: "…" }
];

/** Apply `EXPECTED_FAILURES` to one example's steps, in place. */
export function applyExpectedFailures(name, steps, list = EXPECTED_FAILURES) {
  for (const entry of list) {
    if (entry.framework !== name) continue;
    // Without `g`/`y`: a stateful regex would match every other call.
    const pattern = new RegExp(entry.match.source, entry.match.flags.replace(/[gy]/g, ""));
    const result = steps[entry.step];
    if (result?.status === "fail" && pattern.test(result.message ?? "")) {
      steps[entry.step] = {
        status: "xfail",
        message: `${entry.ref} (${entry.reason}): ${result.message ?? "failed"}`,
      };
    } else if (result?.status === "pass") {
      steps[entry.step] = {
        status: "fail",
        message:
          `${entry.ref} is listed in EXPECTED_FAILURES but passed: remove the entry ` +
          "(scripts/examples-e2e/lib.mjs) together with the fix",
      };
    } else if (result?.status !== "fail") {
      // Skipped or never reached: the entry no longer observes anything.
      steps[entry.step] = {
        status: "fail",
        message:
          `${entry.ref} is listed in EXPECTED_FAILURES but ${entry.step} was ` +
          `${result ? result.status : "not reached"}: the entry is stale`,
      };
    }
  }
  return steps;
}

/**
 * The F-15 run variant: `defaultLocale: "uk"` with `fallbackLocale: "en"`.
 *
 * Every example ships default = fallback = en, which hides one class of bug:
 * a server that preloads the default and the visitor's locale but not the
 * fallback locale renders correctly anyway, because the fallback IS the
 * default. The runner applies these edits to its temp copy of the example only
 * (the demos keep en as the default), and each edit must match exactly once,
 * so a reworded config fails loudly instead of silently testing the default.
 * `requires` is a line that must already be there for the variant to mean
 * what it says.
 */
export const F15_VARIANT = {
  next: {
    edits: [
      { file: "src/i18n/routing.ts", from: 'defaultLocale: "en"', to: 'defaultLocale: "uk"' },
    ],
    requires: [{ file: "src/i18n/config.ts", text: 'fallbackLocale: "en"' }],
  },
  nuxt: {
    edits: [{ file: "nuxt.config.ts", from: 'defaultLocale: "en"', to: 'defaultLocale: "uk"' }],
    requires: [{ file: "nuxt.config.ts", text: 'fallbackLocale: "en"' }],
  },
};

/**
 * The SSR recipes' concurrency variants, applied to the copy in this order
 * after the main phase.
 *
 *   - `pressure`: 10 ms where a deployed app waits on the network: after the
 *     catalogs load (a CDN round trip), and between the moment the request's
 *     locale is known and the moment its text renders (a database read in a
 *     SvelteKit `load`, a page's own resource under its own `<Suspense>` in
 *     SolidStart). With bundled catalogs and nothing else to wait for, a burst
 *     renders one request at a time, even a shared instance comes out right,
 *     and SolidStart has nothing to stream. Steps a (as a2) and e run here.
 *   - `shared`: `pressure`, with one module-level instance rendering every
 *     request, the mistake the recipes are built to avoid. Step e2 runs here
 *     and must find responses in another request's locale; if it does not,
 *     step e proves nothing. A green e is evidence only next to a green e2,
 *     which shows that this burst overlaps enough to expose a leak.
 */
export const RECIPE_VARIANTS = {
  sveltekit: {
    pressure: {
      edits: [
        {
          file: "src/routes/+layout.server.ts",
          from: "  await i18n.init();\n",
          to: "  await i18n.init();\n  await new Promise((resolve) => setTimeout(resolve, 10));\n",
        },
      ],
    },
    shared: {
      files: {
        "src/lib/shared.ts": [
          'import { createI18n, icuCompiler } from "@comvi/svelte";',
          'import { catalogLoader, fallbackLocale } from "./i18n";',
          "",
          "export const shared = createI18n({",
          "  locale: fallbackLocale,",
          "  fallbackLocale,",
          "  compiler: icuCompiler,",
          "}).use(catalogLoader());",
          "",
        ].join("\n"),
      },
      edits: [
        {
          file: "src/routes/+layout.server.ts",
          from: 'import type { LayoutServerLoad } from "./$types";',
          to: 'import type { LayoutServerLoad } from "./$types";\nimport { shared } from "../lib/shared";',
        },
        {
          file: "src/routes/+layout.server.ts",
          from: "  const i18n = createI18n({ locale, fallbackLocale, compiler: icuCompiler }).use(catalogLoader());\n  await i18n.init();\n",
          to: "  const i18n = shared;\n  await i18n.setLocale(locale);\n",
        },
        {
          file: "src/routes/+layout.svelte",
          from: '  import type { LayoutData } from "./$types";',
          to: '  import type { LayoutData } from "./$types";\n  import { shared } from "../lib/shared";',
        },
        {
          file: "src/routes/+layout.svelte",
          from: "  setI18nContext(i18n);",
          to: "  setI18nContext(shared);",
        },
      ],
    },
  },
  solidstart: {
    pressure: {
      edits: [
        {
          file: "src/lib/i18n.ts",
          from: "  await i18n.init();\n",
          to: "  await i18n.init();\n  await new Promise((resolve) => setTimeout(resolve, 10));\n",
        },
        {
          file: "src/routes/[[locale]]/index.tsx",
          from: 'import { createSignal } from "solid-js";',
          to: 'import { createResource, createSignal, Show, Suspense } from "solid-js";',
        },
        {
          file: "src/routes/[[locale]]/index.tsx",
          from: "  const [count, setCount] = createSignal(1);",
          to:
            "  const [count, setCount] = createSignal(1);\n" +
            "  const [later] = createResource(\n" +
            "    () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 10)),\n" +
            "    { deferStream: true },\n" +
            "  );",
        },
        {
          file: "src/routes/[[locale]]/index.tsx",
          from: '      <p data-testid="greeting">{t("greeting.hello", { name: "Ada" })}</p>',
          to:
            "      <Suspense>\n" +
            "        <Show when={later()}>\n" +
            '          <p data-testid="greeting">{t("greeting.hello", { name: "Ada" })}</p>\n' +
            "        </Show>\n" +
            "      </Suspense>",
        },
      ],
    },
    shared: {
      files: {
        "src/lib/shared.ts": [
          'import { createI18n, icuCompiler } from "@comvi/solid";',
          'import { catalogLoader, fallbackLocale } from "./i18n";',
          "",
          "export const shared = createI18n({",
          "  locale: fallbackLocale,",
          "  fallbackLocale,",
          "  compiler: icuCompiler,",
          "}).use(catalogLoader());",
          "",
        ].join("\n"),
      },
      edits: [
        {
          file: "src/routes/[[locale]].tsx",
          from: 'import { catalogLoader, fallbackLocale, loadI18n, localePath, locales } from "~/lib/i18n";',
          to:
            'import { catalogLoader, fallbackLocale, loadI18n, localePath, locales } from "~/lib/i18n";\n' +
            'import { shared } from "~/lib/shared";',
        },
        {
          file: "src/routes/[[locale]].tsx",
          from: [
            "        const i18n = createI18n({",
            "          locale: ready.locale,",
            "          fallbackLocale,",
            "          compiler: icuCompiler,",
            "          messages: ready.messages,",
            "        }).use(catalogLoader());",
          ].join("\n"),
          to: "        const i18n = shared;\n        i18n.addMessages(ready.messages);",
        },
      ],
    },
  },
};

/**
 * Apply a run variant to a copied example, failing unless every edit matches
 * once. `files` are written whole, before the edits.
 */
export function applyVariant(dir, variant) {
  for (const { file, text } of variant.requires ?? []) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    if (!source.includes(text)) throw new Error(`variant: ${file} no longer contains ${text}`);
  }
  for (const [file, content] of Object.entries(variant.files ?? {})) {
    fs.writeFileSync(path.join(dir, file), content);
  }
  for (const { file, from, to } of variant.edits) {
    const target = path.join(dir, file);
    const source = fs.readFileSync(target, "utf8");
    const count = source.split(from).length - 1;
    if (count !== 1) {
      throw new Error(`variant: expected ${from} exactly once in ${file}, found ${count}`);
    }
    fs.writeFileSync(target, source.replace(from, to));
  }
}

/** `pnpm pack`'s file name for a package: `@comvi/core@0.5.0` → `comvi-core-0.5.0.tgz`. */
export function tarballName(pkg) {
  return `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
}

/** A file's digest, as hex (sha256, for logs) or as an npm/pnpm SRI string (sha512). */
export function fileDigest(file, algorithm = "sha256") {
  const hash = crypto.createHash(algorithm).update(fs.readFileSync(file));
  return algorithm === "sha512" ? `sha512-${hash.digest("base64")}` : hash.digest("hex");
}

/**
 * The packages with `tarball` pointing into a candidate directory, as
 * `--tarballs <dir>` passes it: the release workflow packs once, verifies
 * those files and publishes the same files.
 *
 * Name and version come from `package/package.json` inside each tarball, not
 * from the checkout: the job that verifies a release candidate runs on an
 * un-rewritten checkout (an RC's versions exist only in the pack job), and
 * the tarball is the thing under test anyway. The set of names must be the
 * workspace's publishable set exactly — a missing package, a stray `.tgz`, or
 * a file whose name is not `pnpm pack`'s for its manifest all fail.
 */
export function candidatePackages(dir, packages, readManifest = packedManifest) {
  const absolute = path.resolve(dir);
  const out = [];
  for (const file of fs
    .readdirSync(absolute)
    .filter((entry) => entry.endsWith(".tgz"))
    .sort()) {
    const tarball = path.join(absolute, file);
    const { name, version } = readManifest(tarball);
    if (!packages.some((pkg) => pkg.name === name)) {
      throw new Error(`--tarballs: ${file} holds ${name}, which no workspace package names`);
    }
    if (tarballName({ name, version }) !== file) {
      throw new Error(
        `--tarballs: ${file} holds ${name}@${version}; pnpm would name it ${tarballName({ name, version })}`,
      );
    }
    if (out.some((pkg) => pkg.name === name)) {
      throw new Error(`--tarballs: more than one tarball for ${name} in ${absolute}`);
    }
    out.push({ ...packages.find((pkg) => pkg.name === name), version, tarball });
  }
  const missing = packages.filter((pkg) => !out.some((entry) => entry.name === pkg.name));
  if (missing.length > 0) {
    throw new Error(
      `--tarballs: no tarball in ${absolute} for ${missing.map((pkg) => pkg.name).join(", ")}`,
    );
  }
  return out;
}

/**
 * Every `@comvi/*` entry of a pnpm v9 lockfile's `packages:` section, as
 * `{ name, reference, integrity, tarball }`. Two shapes are expected:
 *
 *   - `'@comvi/core@file:<path>'` — an override to a local tarball; `tarball`
 *     is that path made absolute against `installDir`;
 *   - `'@comvi/core@0.5.0'` — a version resolved through the candidate
 *     registry (a peer no override reaches); `tarball` is the URL pnpm
 *     recorded, or null.
 *
 * `snapshots:` is not read: it repeats the keys without resolutions.
 */
export function comviLockEntries(lockfile, installDir) {
  const lines = lockfile.split("\n");
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) return [];
  const out = [];
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // the next top-level section
    const key = /^ {2}'?(@[^@'\s]+\/[^@'\s]+)@([^']+?)'?:\s*$/.exec(line);
    if (key) {
      current = key[1].startsWith("@comvi/") ? { name: key[1], reference: key[2] } : null;
      if (current) out.push({ ...current, integrity: null, tarball: null });
      continue;
    }
    if (/^ {2}\S/.test(line)) {
      current = null; // a key this parser does not recognise; checked below
      const name = /^ {2}'?(@comvi\/[^@'\s]+)/.exec(line)?.[1];
      if (name) out.push({ name, reference: line.trim(), integrity: null, tarball: null });
      continue;
    }
    const resolution = /^\s+resolution: \{integrity: ([^,\s}]+)(?:, tarball: ([^}]+))?\}/.exec(
      line,
    );
    if (current && resolution) {
      const entry = out[out.length - 1];
      entry.integrity = resolution[1];
      const tarball = resolution[2]?.trim() ?? null;
      entry.tarball = tarball?.startsWith("file:")
        ? path.resolve(installDir, tarball.slice("file:".length))
        : tarball;
    }
  }
  return out;
}

/**
 * Fail unless every `@comvi/*` the install resolved is the candidate's own
 * tarball, byte for byte, whichever way it was resolved:
 *
 *   - a `file:` entry must name the candidate's file, and
 *   - a version entry (resolved through the candidate registry, which is how
 *     every `@comvi` package resolves since the overrides carry versions) must
 *     carry the candidate's version,
 *
 * and in both cases the lockfile's integrity must equal the sha512 of the
 * candidate file. Any other `@comvi/` key, or one without an integrity, is an
 * error rather than something to skip. Fails closed when there are none.
 */
export function assertCandidateIntegrity(lockfile, installDir, packages) {
  const entries = comviLockEntries(lockfile, installDir);
  if (entries.length === 0) {
    throw new Error(
      "the lockfile names no @comvi package resolution, so the candidate's provenance was never checked",
    );
  }
  for (const entry of entries) {
    const pkg = packages.find((candidate) => candidate.name === entry.name);
    if (!pkg?.tarball)
      throw new Error(`${entry.name} resolved, but the candidate has no tarball for it`);
    if (entry.reference.startsWith("file:")) {
      if (entry.tarball !== pkg.tarball) {
        throw new Error(
          `${entry.name} resolved to ${entry.tarball}, not the candidate's ${pkg.tarball}`,
        );
      }
    } else if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.reference)) {
      if (entry.reference !== pkg.version) {
        throw new Error(
          `${entry.name}@${entry.reference} resolved, but the candidate is ${pkg.version}`,
        );
      }
    } else {
      throw new Error(`unexplained @comvi lockfile entry: ${entry.name} (${entry.reference})`);
    }
    if (!entry.integrity)
      throw new Error(`${entry.name}@${entry.reference} has no integrity in the lockfile`);
    const actual = fileDigest(pkg.tarball, "sha512");
    if (actual !== entry.integrity) {
      throw new Error(
        `${entry.name}: the lockfile's integrity ${entry.integrity} is not the candidate tarball's ${actual}`,
      );
    }
  }
  return entries;
}
