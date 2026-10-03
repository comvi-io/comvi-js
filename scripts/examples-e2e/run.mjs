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
 *   2. per example: copy it to a temp dir outside every workspace, pin every
 *      `@comvi/*` to its tarball through `pnpm.overrides`, install, and refuse
 *      to continue unless the lockfile says every `@comvi` resolution is a
 *      local `file:` tarball;
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
  workspacePackages,
} from "../docs-snippets/link-sdk.mjs";
import {
  EXAMPLE_NPMRC,
  KINDS,
  assertLocalResolutions,
  copyTree,
  declaredComviDeps,
  exampleDirs,
  exampleKind,
  withOverrides,
} from "../examples-verify.mjs";
import {
  STEPS,
  allPassed,
  cdnEnv,
  cdnVerdict,
  freePort,
  nuxtCatalogChunks,
  parseArgs,
  renderTable,
  serverCommand,
  startMockCdn,
  startPath,
  stepResults,
} from "./lib.mjs";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(REPO_ROOT, "examples", "locales");
const PLAYWRIGHT = path.join(REPO_ROOT, "node_modules", ".bin", "playwright");
const CONFIG = path.join(HERE, "playwright.config.ts");

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
async function startServer(kind, dir, extraEnv) {
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
 * The two Playwright runs an example can get.
 *
 *   - `main`: every step against the app as built (bundled catalogs, or the
 *     mock CDN under `--cdn`). `k2` skips itself here.
 *   - `cdn-down` (`--cdn` only): the app rebuilt against a CDN address where
 *     nothing listens, running `k2` alone — so the console errors a dead CDN
 *     legitimately produces never reach step `g`, which belongs to `main`.
 */
const PHASES = {
  main: { grep: null, expect: STEPS.filter((step) => step !== "k") },
  "cdn-down": { grep: "\\bk2: ", expect: ["k2"] },
};

/** One Playwright run of the scenario against a served example. */
async function runScenario(example, kind, baseUrl, workDir, options, { phase, cdnUrl }) {
  const reportFile = path.join(workDir, `e2e-report-${phase}.json`);
  const consoleLog = path.join(workDir, `e2e-console-${phase}.log`);
  fs.rmSync(reportFile, { force: true });
  fs.rmSync(consoleLog, { force: true });
  const args = ["test", "--config", CONFIG];
  if (PHASES[phase].grep) args.push("--grep", PHASES[phase].grep);
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
      E2E_CATALOG_CHUNKS: JSON.stringify(chunks),
    }),
  });
  if (!fs.existsSync(reportFile)) {
    throw new Error(`Playwright wrote no report (exit ${status}):\n${tail(output)}`);
  }
  const steps = stepResults(JSON.parse(fs.readFileSync(reportFile, "utf8")));
  const missing = PHASES[phase].expect.filter((step) => !steps[step]);
  if (missing.length > 0) {
    throw new Error(
      `the report has no result for step(s) ${missing.join(", ")} (exit ${status}):\n${tail(output)}`,
    );
  }
  return { steps, output, status };
}

/** Install once, then build → serve → run one phase; builds again for each later phase. */
async function buildServeRun(ctx, phase, cdnUrl) {
  const { example, kind, target, options, log } = ctx;
  const extraEnv = cdnUrl ? cdnEnv(kind, cdnUrl) : {};
  log(`build${cdnUrl ? ` (catalogs from ${cdnUrl})` : ""}…`);
  await runOrThrow("pnpm", KINDS[kind].build, { cwd: target, env: childEnv(kind, extraEnv) });
  const server = await startServer(kind, target, extraEnv);
  try {
    log(`serving ${server.baseUrl}, running the ${phase} phase…`);
    const result = await runScenario(example, kind, server.baseUrl, target, options, {
      phase,
      cdnUrl,
    });
    if (Object.values(result.steps).some((entry) => entry.status === "fail")) {
      console.error(
        `\n${example.name} (${phase}): Playwright output\n${tail(result.output, 80)}\n`,
      );
    }
    return result.steps;
  } finally {
    await server.stop();
  }
}

async function e2eExample(example, packages, options, cdn) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `comvi-e2e-${example.name}-`));
  const result = { name: example.name, dir: target, build: null, steps: {} };
  const started = Date.now();
  const log = (message) => console.error(`examples-e2e: ${example.name}: ${message}`);
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
    fs.writeFileSync(path.join(target, ".npmrc"), EXAMPLE_NPMRC);
    const ctx = { example, kind, target, options, log };

    try {
      log("install…");
      await runOrThrow("pnpm", ["install", "--no-frozen-lockfile", "--ignore-workspace"], {
        cwd: target,
        env: childEnv(kind),
      });
      assertLocalResolutions(
        fs.readFileSync(path.join(target, "pnpm-lock.yaml"), "utf8"),
        declaredComviDeps(manifest),
      );
    } catch (error) {
      result.build = { status: "fail", message: firstLine(error.message) };
      console.error(`\n${example.name}: ${tail(error.message, 60)}\n`);
      return result;
    }

    // Phase 1: everything but k2.
    try {
      result.steps = await buildServeRun(ctx, "main", cdn?.url);
      result.build = { status: "pass" };
    } catch (error) {
      const built = !/^pnpm run build/.test(error.message);
      result.build = built
        ? { status: "pass" }
        : { status: "fail", message: firstLine(error.message) };
      if (!built) return result;
      // k2 and k3 would have skipped without --cdn; failing them for a server
      // that never came up would report a CDN problem nobody tested.
      failAll(
        PHASES.main.expect.filter((step) => cdn || !["k2", "k3"].includes(step)),
        error,
      );
      if (!cdn) {
        for (const step of ["k2", "k3"])
          result.steps[step] = { status: "skip", message: "needs --cdn" };
      }
    }

    if (!cdn) {
      result.steps.k = { status: "skip", message: "needs --cdn" };
      return result;
    }
    const verdict = cdnVerdict(cdn.requests.slice(firstRequest));
    result.steps.k = verdict.ok ? { status: "pass" } : { status: "fail", message: verdict.message };

    // Phase 2: the same app, rebuilt against a CDN that is down.
    try {
      const deadUrl = `http://127.0.0.1:${await freePort()}/cdn/e2e`;
      const steps = await buildServeRun(ctx, "cdn-down", deadUrl);
      result.steps.k2 = steps.k2;
    } catch (error) {
      failAll(["k2"], error);
    }
    return result;
  } catch (error) {
    result.build = { status: "fail", message: firstLine(error.message) };
    console.error(`\n${example.name}: ${error.message}\n`);
    return result;
  } finally {
    result.seconds = Math.round((Date.now() - started) / 1000);
    log(`done in ${result.seconds}s`);
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
  const packages = workspacePackages(REPO_ROOT);
  if (!options.pack) assertTarballsFresh(packages);

  const cdn = options.cdn ? await startMockCdn({ localesDir: LOCALES_DIR }) : null;
  if (cdn) console.error(`examples-e2e: mock CDN at ${cdn.url} (serving ${LOCALES_DIR})`);

  const results = [];
  try {
    for (const example of examples) {
      results.push(await e2eExample(example, packages, options, cdn));
    }
  } finally {
    if (cdn) await cdn.close();
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `\nexamples:e2e${options.cdn ? " --cdn" : ""}: ${results.length} example(s), ` +
      `${packages.length} local tarballs, wall time ${Math.floor(seconds / 60)}m${seconds % 60}s ` +
      `(${results.map((result) => `${result.name} ${result.seconds}s`).join(", ")})\n`,
  );
  console.log(renderTable(results));
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
