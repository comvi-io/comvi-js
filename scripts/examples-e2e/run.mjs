#!/usr/bin/env node
/**
 * `pnpm examples:e2e` — one browser scenario, run against all seven examples.
 *
 * `examples:verify` proves each example installs, builds and typechecks
 * against the LOCAL tarballs. This goes one step further and opens each built
 * app in Chromium, so "the switcher works in Svelte" stops being something the
 * owner checks by hand seven times. The install path is the same one, reused
 * rather than re-implemented (`examples-verify.mjs`, `docs-snippets/link-sdk.mjs`):
 *
 *   1. build the workspace and pack every package (skip with --no-build/--no-pack);
 *   2. per example: copy it to a temp dir outside every workspace, redirect
 *      every declared `@comvi/*` to the candidate's version through
 *      `pnpm.overrides`, serve the whole `@comvi` scope from the candidate
 *      registry, install, and refuse to continue unless the lockfile's
 *      integrity for every `@comvi` resolution is the candidate tarball's;
 *   3. `pnpm run build`, then start the built app the way a reader would —
 *      `vite preview`, `next start`, or Nitro's `.output/server/index.mjs` —
 *      on a free port;
 *   4. run `scenario.spec.ts` against it and read the per-step verdicts from
 *      Playwright's JSON report.
 *
 * `--cdn` additionally starts a mock of the platform CDN that serves
 * `examples/locales` in the layout `@comvi/plugin-fetch-loader` requests, and
 * builds every example with its "Connect to Comvi" env var set
 * (`VITE_COMVI_CDN_URL`, `NEXT_PUBLIC_COMVI_CDN_URL`,
 * `NUXT_PUBLIC_COMVI_CDN_URL`), so the same scenario runs on catalogs fetched
 * over HTTP. The `cdn` column then checks the mock's request log: an env var
 * that silently did not apply would otherwise pass on the bundled import map.
 *
 *   node scripts/examples-e2e/run.mjs [--only react,next] [--cdn]
 *                                     [--no-build] [--no-pack] [--keep] [--headed]
 *                                     [--tarballs <dir>]
 *
 * `--tarballs <dir>` runs against a release candidate: the `.tgz` files in
 * `<dir>`, exactly as `scripts/publish-candidate.mjs pack` packed them and
 * the release workflow's publish job will publish them. It implies
 * `--no-build --no-pack`. After every install, each `@comvi/*` in the lockfile
 * must carry the sha512 of the candidate's own file (`assertCandidateIntegrity`),
 * which every run checks, candidate or not, against whichever tarballs it
 * installed.
 *
 * Every temp install, build and server runs the pnpm this repo pins
 * (`packageManager`, 9.12.1 — what CI runs), not whatever `pnpm` is on PATH:
 * the temp manifest carries the same `packageManager` field, and
 * `assertPinnedPnpm` fails the example before its install under any other
 * version. A laptop's corepack shim outside the repo otherwise runs its own
 * default (10.x), which accepted overrides pnpm 9 rejects; `withOverrides` in
 * `examples-verify.mjs` says why the overrides are now keyed by declared spec.
 *
 * Each example runs up to three builds of the same copy: `main` (every step
 * but k2, s, z and the CDN-steering steps), `cdn-down` under `--cdn` (k2, z,
 * and g again as g2), and `f15` for next and nuxt without `--cdn` (step s,
 * against the `F15_VARIANT` edit of the copy). Under `--cdn` each CDN-steering
 * step (r, x, t, t2, u, v, v2) runs between main and cdn-down, against the main
 * build on a fresh server of its own. A skip outside `allowedSkips` fails its
 * step, and a failure is green only when `EXPECTED_FAILURES` lists it with a
 * reference. Step r judges every delivered mutation batch: a mixed-language
 * or raw-key state fails it, and each one is also printed under the table and
 * written, with every result, to `test-results/examples-e2e/report[-cdn].json`
 * under `findings.mixedStates`, with paint diagnostics. On any failure the reports, console logs, server logs and
 * Playwright traces are copied to `test-results/examples-e2e/<example>[-cdn]/`,
 * `--keep` or not.
 *
 * Where it runs: `pnpm examples:e2e:all` (both modes) closes `test:release`,
 * and CI's `examples-e2e` job runs one `--only <framework> [--cdn]` shard per
 * runner whenever packages/, examples/ or this runner change.
 *
 * Production builds only. A development build's console warnings (an unknown
 * key under `strict: "dev"`, which no example enables) are not observed here;
 * `packages/core/tests/dist/missing-key-warning.dist.test.ts` covers them
 * against the built dev and prod entries, with step `l`'s key. A `--dev` mode
 * was not added: steps e, f, j and o assert on built chunks and SSR output a
 * dev server does not produce, and with `strict` off it would assert nothing.
 *
 * Nothing phones home: every child process runs with `CI=1`, the Next and Nuxt
 * telemetry switches and `DO_NOT_TRACK=1`, exactly as `examples:verify` does.
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { spawn } from "node:child_process";

import {
  REPO_ROOT,
  assertTarballsFresh,
  cleanTarballs,
  tarballFor,
  workspacePackages,
} from "../docs-snippets/link-sdk.mjs";
import {
  EXAMPLE_NPMRC,
  KINDS,
  assertLocalResolutions,
  assertPinnedPnpm,
  copyTree,
  declaredComviDeps,
  exampleDirs,
  exampleKind,
  withOverrides,
} from "../examples-verify.mjs";
import {
  CDN_CONTROL_STEPS,
  CDN_MARK,
  F15_VARIANT,
  STEPS,
  allPassed,
  applyExpectedFailures,
  applyVariant,
  candidatePackages,
  cdnEnv,
  cdnVerdict,
  collectFindings,
  enforceSkipMatrix,
  fileDigest,
  freePort,
  nuxtCatalogChunks,
  parseArgs,
  renderFindings,
  renderTable,
  serverCommand,
  startMockCdn,
  startPath,
  stepFindings,
  stepResults,
} from "./lib.mjs";
import { scopeRegistryLine, startCandidateRegistry } from "./candidate-registry.mjs";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(REPO_ROOT, "examples", "locales");
const PLAYWRIGHT = path.join(REPO_ROOT, "node_modules", ".bin", "playwright");
const CONFIG = path.join(HERE, "playwright.config.ts");
/** Where a failing example's diagnostics are copied, `--keep` or not. */
const RESULTS_DIR = path.join(REPO_ROOT, "test-results", "examples-e2e");

/** The variables that switch an example to the CDN; scrubbed from every non-`--cdn` run. */
const CDN_VARS = ["VITE_COMVI_CDN_URL", "NEXT_PUBLIC_COMVI_CDN_URL", "NUXT_PUBLIC_COMVI_CDN_URL"];

/** The environment every child runs with: quiet, non-interactive, no telemetry. */
function childEnv(kind, extra = {}) {
  const env = { ...process.env };
  for (const name of CDN_VARS) delete env[name];
  return {
    ...env,
    CI: "1",
    DO_NOT_TRACK: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    NUXT_TELEMETRY_DISABLED: "1",
    ...(kind ? KINDS[kind].env : {}),
    ...extra,
  };
}

/**
 * Run a command to completion WITHOUT blocking the event loop.
 *
 * `spawnSync` would be simpler and is wrong here: the mock CDN lives in this
 * process, and `next build` prerenders `/en`, `/uk` and `/de` by fetching from
 * it. A synchronous child would leave the mock unable to answer the very build
 * that is waiting on it.
 */
function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ status: -1, output: `${output}\n${error.message}` }));
    child.on("close", (status) => resolve({ status, output }));
  });
}

async function runOrThrow(command, args, options) {
  const { status, output } = await run(command, args, options);
  if (status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${status}\n${output}`);
}

function tail(text, lines = 40) {
  return text.trim().split("\n").slice(-lines).join("\n");
}

/**
 * Resolve once `target` answers with anything below 500. Reject when the
 * process exits, on timeout, or when the server is UP but has answered 5xx for
 * `errorGraceMs` straight — a listening server that fails every request is a
 * finding, and its body (usually the error message) is what the table shows.
 */
function waitForServer(
  target,
  child,
  getOutput,
  { timeoutMs = 90_000, errorGraceMs = 15_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let firstError = null;
  let lastError = "";
  return new Promise((resolve, reject) => {
    let exited = false;
    child.once("exit", (code) => {
      exited = true;
      reject(new Error(`the server exited (${code}) before answering:\n${tail(getOutput())}`));
    });
    const probe = () => {
      if (exited) return;
      // JSON, so a framework's error page reports its message rather than its markup.
      const request = http.get(target, { headers: { accept: "application/json" } }, (response) => {
        const status = response.statusCode ?? 500;
        if (status < 500) {
          response.resume();
          resolve();
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          firstError ??= Date.now();
          lastError = `GET ${new URL(target).pathname} answered ${status}: ${body.replace(/\s+/g, " ").slice(0, 200)}`;
          if (Date.now() - firstError > errorGraceMs) {
            reject(new Error(`${lastError}\n${tail(getOutput())}`));
          } else retry();
        });
      });
      request.on("error", retry);
      request.setTimeout(5_000, () => request.destroy());
    };
    const retry = () => {
      if (exited) return;
      if (Date.now() > deadline) {
        reject(
          new Error(
            `${lastError || `no answer from ${target}`} within ${timeoutMs / 1000}s:\n${tail(getOutput())}`,
          ),
        );
        return;
      }
      setTimeout(probe, 300);
    };
    probe();
  });
}

/** Start the built app; the returned `stop()` kills its whole process group. */
async function startServer(kind, dir, extraEnv, logFile) {
  const port = await freePort();
  const spec = serverCommand(kind, { dir, port, env: extraEnv });
  const child = spawn(spec.command, spec.args, {
    cwd: dir,
    env: childEnv(kind, { NODE_ENV: "production", ...spec.env }),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = () =>
    new Promise((resolve) => {
      fs.writeFileSync(logFile, output);
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }, 5_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  try {
    await waitForServer(`${baseUrl}${startPath(kind)}`, child, () => output);
  } catch (error) {
    await stop();
    throw error;
  }
  return { baseUrl, stop, output: () => output };
}

/**
 * The Playwright runs an example can get, each against its own build.
 *
 *   - `main`: every step but k2, z and s against the app as built (bundled
 *     catalogs, or the mock CDN under `--cdn`).
 *   - `cdn-down` (`--cdn` only): the app rebuilt against a CDN address where
 *     nothing listens, running k2, z and g. g's result here is column g2: the
 *     same "no browser errors" verdict, with the narrow allowlist of network
 *     messages a dead CDN legitimately produces (the spec owns that list).
 *   - `f15` (next and nuxt, without `--cdn`): the copy edited by
 *     `F15_VARIANT` to `defaultLocale: "uk"`, running s alone.
 *   - `main-cdn` (`--cdn`): `main` without steps r and x, which then run in
 *     their own `cdn-r` and `cdn-x` phases so they can hold each switch at
 *     the mock CDN.
 *   - `cdn-<step>` (`--cdn` only), one per `CDN_STEERED` step: the main
 *     build, served by a FRESH server, running that step alone. The step
 *     steers the mock CDN (hold, hang, corrupt), and a server that already
 *     holds uk and de from an earlier step would have nothing left to race.
 *
 * `rename` maps a test's step id to the column its result fills.
 */
const CDN_STEERED = ["r", "x", ...CDN_CONTROL_STEPS];
const mainPhase = (excluded) => ({
  args: ["--grep-invert", `\\b(${["k2", "s", "z", ...excluded].join("|")}): `],
  expect: STEPS.filter((step) => !["k", "k2", "g2", "s", "z", ...excluded].includes(step)),
  rename: {},
});
const PHASES = {
  main: mainPhase(CDN_CONTROL_STEPS),
  "main-cdn": mainPhase(CDN_STEERED),
  "cdn-down": {
    args: ["--grep", "\\b(k2|z|g): "],
    expect: ["k2", "z", "g"],
    rename: { g: "g2" },
  },
  f15: { args: ["--grep", "\\bs: "], expect: ["s"], rename: {} },
  ...Object.fromEntries(
    CDN_STEERED.map((step) => [
      `cdn-${step}`,
      { args: ["--grep", `\\b${step}: `], expect: [step], rename: {} },
    ]),
  ),
};

/** One Playwright run of the scenario against a served example. */
async function runScenario(
  example,
  kind,
  baseUrl,
  workDir,
  options,
  { phase, cdnUrl, controlUrl },
) {
  const reportFile = path.join(workDir, `e2e-report-${phase}.json`);
  const consoleLog = path.join(workDir, `e2e-console-${phase}.log`);
  fs.rmSync(reportFile, { force: true });
  fs.rmSync(consoleLog, { force: true });
  const args = ["test", "--config", CONFIG, ...PHASES[phase].args];
  if (options.headed) args.push("--headed");
  // Nuxt's catalog chunks are hash-named; the manifest says which one is which.
  const chunks =
    kind === "nuxt"
      ? nuxtCatalogChunks(
          (
            await import(
              url.pathToFileURL(
                path.join(workDir, ".nuxt", "dist", "server", "client.manifest.mjs"),
              ).href + `?t=${Date.now()}`
            )
          ).default,
        )
      : {};
  const { status, output } = await run(PLAYWRIGHT, args, {
    cwd: REPO_ROOT,
    env: childEnv(null, {
      E2E_BASE_URL: baseUrl,
      E2E_FRAMEWORK: example.name,
      E2E_KIND: kind,
      E2E_START_PATH: startPath(kind),
      E2E_LOCALES_DIR: LOCALES_DIR,
      E2E_CONSOLE_LOG: consoleLog,
      E2E_JSON_REPORT: reportFile,
      E2E_OUTPUT_DIR: path.join(workDir, `e2e-artifacts-${phase}`),
      E2E_PHASE: phase,
      E2E_CDN_URL: cdnUrl ?? "",
      E2E_CDN_CONTROL: controlUrl ?? "",
      E2E_CDN_MARK: CDN_MARK,
      E2E_CATALOG_CHUNKS: JSON.stringify(chunks),
    }),
  });
  fs.writeFileSync(path.join(workDir, `e2e-playwright-${phase}.log`), output);
  if (!fs.existsSync(reportFile)) {
    throw new Error(`Playwright wrote no report (exit ${status}):\n${tail(output)}`);
  }
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const reported = stepResults(report);
  const findings = stepFindings(report).map((finding) => ({ ...finding, phase }));
  const missing = PHASES[phase].expect.filter((step) => !reported[step]);
  if (missing.length > 0) {
    throw new Error(
      `the report has no result for step(s) ${missing.join(", ")} (exit ${status}):\n${tail(output)}`,
    );
  }
  const steps = {};
  for (const [step, entry] of Object.entries(reported)) {
    steps[PHASES[phase].rename[step] ?? step] = entry;
  }
  return { steps, findings, output, status };
}

/** Install once, then build → serve → run one phase; builds again for each later phase. */
async function buildServeRun(ctx, phase, cdnUrl) {
  const { kind, target, log } = ctx;
  log(`build${cdnUrl ? ` (catalogs from ${cdnUrl})` : ""}…`);
  await runOrThrow("pnpm", KINDS[kind].build, {
    cwd: target,
    env: childEnv(kind, cdnUrl ? cdnEnv(kind, cdnUrl) : {}),
  });
  return serveRun(ctx, phase, cdnUrl);
}

/** Serve the copy as last built, on a fresh server, and run one phase against it. */
async function serveRun(ctx, phase, cdnUrl) {
  const { example, kind, target, options, log } = ctx;
  const extraEnv = cdnUrl ? cdnEnv(kind, cdnUrl) : {};
  const server = await startServer(
    kind,
    target,
    extraEnv,
    path.join(target, `e2e-server-${phase}.log`),
  );
  try {
    log(`serving ${server.baseUrl}, running the ${phase} phase…`);
    const result = await runScenario(example, kind, server.baseUrl, target, options, {
      phase,
      cdnUrl,
      controlUrl: ctx.controlUrl,
    });
    if (Object.values(result.steps).some((entry) => entry.status === "fail")) {
      console.error(
        `\n${example.name} (${phase}): Playwright output\n${tail(result.output, 80)}\n`,
      );
    }
    ctx.findings.push(...result.findings);
    return result.steps;
  } finally {
    await server.stop();
  }
}

/**
 * Copy a failing example's diagnostics out of its temp directory, which is
 * deleted unless `--keep`: per phase the JSON report, the console log, the
 * Playwright output, the server's output and the traces Playwright retained.
 */
const diagnosticsDir = (name, cdn) => path.join(RESULTS_DIR, `${name}${cdn ? "-cdn" : ""}`);

function keepDiagnostics(result, target, cdn) {
  const out = diagnosticsDir(result.name, cdn);
  fs.mkdirSync(out, { recursive: true });
  for (const entry of fs.existsSync(target) ? fs.readdirSync(target) : []) {
    if (!/^e2e-/.test(entry)) continue;
    fs.cpSync(path.join(target, entry), path.join(out, entry), { recursive: true });
  }
  return out;
}

async function e2eExample(example, packages, options, cdn) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `comvi-e2e-${example.name}-`));
  // A previous run's diagnostics for this example would read as this run's.
  fs.rmSync(diagnosticsDir(example.name, cdn), { recursive: true, force: true });
  const result = { name: example.name, dir: target, build: null, steps: {}, findings: [] };
  const started = Date.now();
  const log = (message) => console.error(`examples-e2e: ${example.name}: ${message}`);
  cdn?.reset();
  const firstRequest = cdn ? cdn.requests.length : 0;
  const failAll = (steps, error) => {
    // The server never came up, or Playwright never reported: every step is a
    // failure with the same cause, rather than a blank that reads as "ok".
    for (const step of steps)
      result.steps[step] = { status: "fail", message: firstLine(error.message) };
    console.error(`\n${example.name}: ${tail(error.message, 60)}\n`);
  };
  try {
    copyTree(example.dir, target);
    const manifestPath = path.join(target, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const kind = exampleKind(manifest, `examples/${example.name}`);
    result.kind = kind;
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(withOverrides(manifest, packages), null, 2)}\n`,
    );
    // The whole @comvi scope resolves from the candidate, peers included
    // (candidate-registry.mjs says why the overrides alone are not enough).
    fs.writeFileSync(
      path.join(target, ".npmrc"),
      EXAMPLE_NPMRC + scopeRegistryLine(options.registryUrl),
    );
    assertPinnedPnpm(target, { env: childEnv(kind) });
    const ctx = {
      example,
      kind,
      target,
      options,
      log,
      findings: result.findings,
      controlUrl: cdn?.controlUrl,
    };

    try {
      log("install…");
      await runOrThrow("pnpm", ["install", "--no-frozen-lockfile", "--ignore-workspace"], {
        cwd: target,
        env: childEnv(kind),
      });
      const lockfile = fs.readFileSync(path.join(target, "pnpm-lock.yaml"), "utf8");
      const entries = assertLocalResolutions(lockfile, declaredComviDeps(manifest), {
        installDir: target,
        packages,
      });
      result.resolved = [...new Set(entries.map((entry) => entry.name))].sort();
    } catch (error) {
      result.build = { status: "fail", message: firstLine(error.message) };
      console.error(`\n${example.name}: ${tail(error.message, 60)}\n`);
      return result;
    }

    // Phase 1: everything but k2, z, s and (under --cdn) the steered steps.
    const mainName = cdn ? "main-cdn" : "main";
    try {
      Object.assign(result.steps, await buildServeRun(ctx, mainName, cdn?.url));
      result.build = { status: "pass" };
    } catch (error) {
      const built = !/^pnpm run build/.test(error.message);
      result.build = built
        ? { status: "pass" }
        : { status: "fail", message: firstLine(error.message) };
      if (!built) return result;
      // k3 would have skipped without --cdn; failing it for a server that never
      // came up would report a CDN problem nobody tested.
      failAll(
        PHASES[mainName].expect.filter((step) => cdn || step !== "k3"),
        error,
      );
      if (!cdn) result.steps.k3 = { status: "skip", message: "needs --cdn" };
    }

    if (cdn) {
      const verdict = cdnVerdict(cdn.requests.slice(firstRequest));
      result.steps.k = verdict.ok
        ? { status: "pass" }
        : { status: "fail", message: verdict.message };

      // The steps that steer the mock: the main build, a fresh server each.
      if (result.build.status === "pass") {
        for (const step of CDN_STEERED) {
          try {
            Object.assign(result.steps, await serveRun(ctx, `cdn-${step}`, cdn.url));
          } catch (error) {
            failAll([step], error);
          } finally {
            // The mode a step set must not reach the next step or example.
            cdn.reset();
          }
        }
      }

      // Phase 2: the same app, rebuilt against a CDN that is down.
      try {
        const deadUrl = `http://127.0.0.1:${await freePort()}/cdn/e2e`;
        Object.assign(result.steps, await buildServeRun(ctx, "cdn-down", deadUrl));
      } catch (error) {
        failAll(["k2", "z", "g2"], error);
      }
      result.steps.s = { status: "skip", message: "the F-15 variant runs in the bundled mode" };
    } else {
      for (const step of ["k", "k2", "g2", "z", ...CDN_CONTROL_STEPS])
        result.steps[step] = { status: "skip", message: "needs --cdn" };
      if (F15_VARIANT[kind]) {
        // Phase 3: the same copy with defaultLocale uk, rebuilt. Last, because
        // the edit stays in the copy.
        try {
          applyVariant(target, F15_VARIANT[kind]);
          Object.assign(result.steps, await buildServeRun(ctx, "f15", null));
        } catch (error) {
          failAll(["s"], error);
        }
      } else {
        result.steps.s = { status: "skip", message: "client-rendered example: no server render" };
      }
    }
    return result;
  } catch (error) {
    result.build = { status: "fail", message: firstLine(error.message) };
    console.error(`\n${example.name}: ${error.message}\n`);
    return result;
  } finally {
    if (result.kind) {
      enforceSkipMatrix(result.steps, { kind: result.kind, cdn: Boolean(cdn) });
      applyExpectedFailures(example.name, result.steps);
    }
    result.seconds = Math.round((Date.now() - started) / 1000);
    log(`done in ${result.seconds}s`);
    if (!allPassed([result])) log(`diagnostics kept in ${keepDiagnostics(result, target, cdn)}`);
    if (!options.keep) fs.rmSync(target, { recursive: true, force: true });
    else log(`kept ${target}`);
  }
}

function firstLine(message) {
  return message.split("\n")[0].slice(0, 300);
}

/** Fail fast, with the fix, when Playwright's Chromium is not downloaded. */
async function assertChromium() {
  const { chromium } = await import("@playwright/test");
  const executable = chromium.executablePath();
  if (!fs.existsSync(executable)) {
    throw new Error(
      `Playwright's Chromium is not installed (looked for ${executable}). Run once:\n\n` +
        "  pnpm exec playwright install chromium\n",
    );
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  let examples = exampleDirs();
  if (options.only.length > 0) {
    const wanted = new Set(options.only);
    const missing = [...wanted].filter((name) => !examples.some((entry) => entry.name === name));
    if (missing.length > 0) {
      console.error(`no such example: ${missing.join(", ")}`);
      return 2;
    }
    examples = examples.filter((entry) => wanted.has(entry.name));
  }
  await assertChromium();

  const started = Date.now();
  if (options.build) await runOrThrow("pnpm", ["build"], { cwd: REPO_ROOT, env: childEnv(null) });
  if (options.pack) {
    cleanTarballs(REPO_ROOT);
    await runOrThrow("pnpm", ["pack:release"], { cwd: REPO_ROOT, env: childEnv(null) });
  }
  let packages;
  if (options.tarballs) {
    packages = candidatePackages(options.tarballs, workspacePackages(REPO_ROOT));
  } else {
    packages = workspacePackages(REPO_ROOT);
    if (!options.pack) assertTarballsFresh(packages);
    packages = packages.map((pkg) => ({ ...pkg, tarball: tarballFor(pkg) }));
  }
  // The exact bytes under test, in the log: a release job prints the same
  // digests when it publishes, so the two can be compared line by line.
  console.error("examples-e2e: tarballs under test (sha256):");
  for (const pkg of packages) {
    console.error(`  ${fileDigest(pkg.tarball)}  ${path.basename(pkg.tarball)}`);
  }

  const registry = await startCandidateRegistry(packages.map((pkg) => pkg.tarball));
  options.registryUrl = registry.url;
  console.error(`examples-e2e: @comvi scope served from the candidate at ${registry.url}`);
  const cdn = options.cdn ? await startMockCdn({ localesDir: LOCALES_DIR }) : null;
  if (cdn) console.error(`examples-e2e: mock CDN at ${cdn.url} (serving ${LOCALES_DIR})`);

  const results = [];
  try {
    for (const example of examples) {
      results.push(await e2eExample(example, packages, options, cdn));
    }
  } finally {
    if (cdn) await cdn.close();
    await registry.close();
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `\nexamples:e2e${options.cdn ? " --cdn" : ""}: ${results.length} example(s), ` +
      `${packages.length} ${options.tarballs ? `candidate tarballs from ${options.tarballs}` : "local tarballs"}, wall time ${Math.floor(seconds / 60)}m${seconds % 60}s ` +
      `(${results.map((result) => `${result.name} ${result.seconds}s`).join(", ")})\n`,
  );
  console.log(renderTable(results));
  const mode = options.cdn ? "cdn" : "default";
  const findings = collectFindings(results, mode);
  const findingsText = renderFindings(findings);
  if (findingsText) console.log(findingsText);
  // The whole run as data: every step's verdict, and step r's mixed states
  // with their paint diagnostics.
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const reportFile = path.join(RESULTS_DIR, `report${options.cdn ? "-cdn" : ""}.json`);
  fs.writeFileSync(
    reportFile,
    `${JSON.stringify(
      {
        mode,
        tarballs: packages.map((pkg) => ({
          name: pkg.name,
          file: path.basename(pkg.tarball),
          sha256: fileDigest(pkg.tarball),
        })),
        results: results.map(({ name, kind, build, steps, seconds, resolved }) => ({
          name,
          kind,
          build,
          steps,
          seconds,
          resolved,
        })),
        findings,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nreport: ${path.relative(REPO_ROOT, reportFile)}`);
  return allPassed(results) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`examples-e2e: ${error.message}`);
    process.exitCode = 2;
  }
}
