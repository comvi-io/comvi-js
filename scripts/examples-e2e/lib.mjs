import crypto from "node:crypto";
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

/**
 * The scenario's steps, in the order the table prints them. `k` is the
 * runner's own verdict on the mock CDN's request log; `g2` is step `g`'s test
 * run again in the dead-CDN phase; every other step is a test in
 * `scenario.spec.ts` whose title starts with its id.
 */
export const STEPS = [
  "a",
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
];

/** What each step asserts, printed under the table so a column id is never a riddle. */
export const STEP_LEGEND = {
  a: "initial render shows real text, no raw keys",
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
  r: "DOM states during en → uk → de: never a raw key or a mixed-language frame",
  s: "F-15: defaultLocale uk, /uk renders the en value of an en-only key, SSR and hydrated",
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
export function cdnCatalog(catalog, locale) {
  const missing = new Set(CDN_MISSING[locale] ?? []);
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
 * A server for `examples/locales` in the platform CDN layout, every message
 * marked by `cdnCatalog`.
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
    const catalog = cdnCatalog(JSON.parse(fs.readFileSync(file, "utf8")), route.locale);
    res
      .writeHead(200, { ...headers, "content-type": "application/json; charset=utf-8" })
      .end(JSON.stringify(catalog));
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

/**
 * The URL path of each locale's catalog chunk, read off Nuxt's client manifest.
 *
 * Vite names a dynamic `import("./locales/uk.json")` chunk `uk-<hash>.js`, so
 * the spec can match it by name; Nuxt names chunks by hash alone, so the only
 * honest way to know which request IS the uk catalog is the manifest the build
 * wrote. `manifest` is that module's default export.
 */
export function nuxtCatalogChunks(manifest) {
  const out = {};
  for (const [key, chunk] of Object.entries(manifest ?? {})) {
    const match = /(?:^|\/)locales\/([A-Za-z0-9_-]+)\.json$/.exec(key);
    if (match && chunk?.file) out[match[1]] = `/_nuxt/${chunk.file}`;
  }
  return out;
}

/** Where the scenario starts: SSR examples carry the locale in the URL. */
export function startPath(kind) {
  return kind === "vite" ? "/" : "/en";
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
 * Findings a test recorded without failing, out of Playwright's JSON report:
 * every annotation whose type is `finding:<kind>`, as
 * `{ kind, step, ...JSON.parse(description) }`. Step r records each
 * mixed-language or raw-key DOM state that was replaced before the next
 * animation frame this way (`subFrameMixedState`).
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
 * `{ subFrameMixedStates: [{ framework, mode, phase, step, … }] }`.
 */
export function collectFindings(results, mode) {
  const findings = { subFrameMixedStates: [] };
  for (const result of results) {
    for (const finding of result.findings ?? []) {
      const { kind, ...rest } = finding;
      const entry = { framework: result.name, mode, ...rest };
      if (kind === "subFrameMixedState") findings.subFrameMixedStates.push(entry);
      else (findings[kind] ??= []).push(entry);
    }
  }
  return findings;
}

/** The findings section printed under the table; empty when there are none. */
export function renderFindings(findings) {
  const states = findings.subFrameMixedStates ?? [];
  if (states.length === 0) return "";
  return [
    "",
    "findings (recorded, not failed): a mixed-language or raw-key state that is replaced " +
      "before the next animation frame is recorded, not failed",
    ...states.map(
      (entry) =>
        `${entry.framework}/${entry.step} (${entry.phase}): ${entry.problem}; ` +
        `lang=${entry.lang}, greeting=${JSON.stringify(entry.text)}, ` +
        `${entry.mutationBatches} mutation batch(es)`,
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
  const header = ["framework", "build", ...STEPS];
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
      ...STEPS.map((step) => cell(step, result.steps?.[step])),
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
    ...STEPS.map((step) => `${step.padEnd(3)} ${STEP_LEGEND[step]}`),
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
      STEPS.every((step) => result.steps?.[step] && result.steps[step].status !== "fail"),
  );
}

/**
 * Every skip the suite may report, per example kind and mode. A skip outside
 * this set FAILS its step (`enforceSkipMatrix`): a test that skipped because a
 * condition went wrong — an env var the runner forgot, a kind it misread —
 * would otherwise print "skip" and leave the run green.
 *
 *   - vite (the five client-rendered examples): f, i and o read server HTML or
 *     a locale in the URL; s is an SSR-only run variant.
 *   - without --cdn: k, k2, k3 and g2 are about the mock CDN.
 *   - with --cdn: s is not run (the F-15 variant runs in the bundled mode).
 */
export function allowedSkips({ kind, cdn }) {
  const allowed = new Set();
  if (kind === "vite") for (const step of ["f", "i", "o", "s"]) allowed.add(step);
  if (cdn) allowed.add("s");
  else for (const step of ["k", "k2", "k3", "g2"]) allowed.add(step);
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
    const result = steps[entry.step];
    if (result?.status === "fail" && entry.match.test(result.message ?? "")) {
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

/** Apply a run variant to a copied example, failing unless every edit matches once. */
export function applyVariant(dir, variant) {
  for (const { file, text } of variant.requires ?? []) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    if (!source.includes(text)) throw new Error(`variant: ${file} no longer contains ${text}`);
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
 * `--tarballs <dir>` passes it: the release job packs once, verifies those
 * files and publishes the same files. A package with no tarball there fails,
 * and so does a `.tgz` in the directory that belongs to no package — a
 * leftover from another version is exactly what must not be verified in place
 * of the candidate.
 */
export function candidatePackages(dir, packages) {
  const absolute = path.resolve(dir);
  const expected = new Set();
  const out = packages.map((pkg) => {
    const tarball = path.join(absolute, tarballName(pkg));
    if (!fs.existsSync(tarball)) {
      throw new Error(`--tarballs: no ${tarballName(pkg)} in ${absolute} for ${pkg.name}`);
    }
    expected.add(path.basename(tarball));
    return { ...pkg, tarball };
  });
  const strays = fs
    .readdirSync(absolute)
    .filter((entry) => entry.endsWith(".tgz") && !expected.has(entry));
  if (strays.length > 0) {
    throw new Error(
      `--tarballs: ${absolute} holds tarballs no package names: ${strays.join(", ")}`,
    );
  }
  return out;
}

/**
 * Every `@comvi/*` tarball resolution in a pnpm v9 lockfile:
 * `{ name, tarball (absolute), integrity }`. The `packages:` entry of a
 * `file:` tarball carries `resolution: {integrity: …, tarball: file:<path>}`,
 * with the path relative to the install directory.
 */
export function tarballResolutions(lockfile, installDir) {
  const out = [];
  const pattern =
    /^\s*'(@comvi\/[A-Za-z0-9._-]+)@file:[^']*':\s*\n\s*resolution: \{integrity: ([^,\s]+), tarball: file:([^}]+)\}/gm;
  for (const match of lockfile.matchAll(pattern)) {
    out.push({
      name: match[1],
      integrity: match[2],
      tarball: path.resolve(installDir, match[3].trim()),
    });
  }
  return out;
}

/**
 * Fail unless every `@comvi/*` the install resolved is the candidate's own
 * tarball, byte for byte: same path, and the lockfile's integrity equal to the
 * sha512 of the file on disk. Fails closed when the lockfile names none.
 */
export function assertCandidateIntegrity(lockfile, installDir, packages) {
  const resolutions = tarballResolutions(lockfile, installDir);
  if (resolutions.length === 0) {
    throw new Error(
      "the lockfile names no @comvi tarball resolution, so the candidate's provenance was never checked",
    );
  }
  for (const entry of resolutions) {
    const pkg = packages.find((candidate) => candidate.name === entry.name);
    if (!pkg?.tarball)
      throw new Error(`${entry.name} resolved, but the candidate has no tarball for it`);
    if (entry.tarball !== pkg.tarball) {
      throw new Error(
        `${entry.name} resolved to ${entry.tarball}, not the candidate's ${pkg.tarball}`,
      );
    }
    const actual = fileDigest(pkg.tarball, "sha512");
    if (actual !== entry.integrity) {
      throw new Error(
        `${entry.name}: the lockfile's integrity ${entry.integrity} is not the candidate tarball's ${actual}`,
      );
    }
  }
  return resolutions;
}
