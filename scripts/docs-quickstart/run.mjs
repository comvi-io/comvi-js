#!/usr/bin/env node
/**
 * Docs quick-start gate: build and RUN the Quick start and Connect to Comvi
 * pages, for every framework, as the project a reader ends up with.
 *
 *   pnpm docs:quickstart --content <dir> [--only react,vue] [--sdk-root <dir>]
 *                        [--no-build] [--no-pack] [--fresh] [--keep] [--jobs N]
 *                        [--next-webpack]
 *
 *     --content   the docs directory holding quick-start.mdx and connect-comvi.mdx
 *                 (the www app's src/content/docs/docs/i18n)
 *     --only      frameworks to run: react, next, vue, nuxt, svelte, solid, vanilla
 *     --sdk-root  the js-sdk checkout whose packages are packed (default: this one)
 *     --no-build / --no-pack   reuse the workspace build / the tarballs on disk
 *     --fresh     re-run the scaffolders instead of using the cached scaffolds
 *     --keep      leave each project directory in place for inspection
 *     --jobs      projects built in parallel (default 3)
 *     --next-webpack  build the Next projects with `next build --webpack` instead of
 *                 the scaffold's `build` script (Turbopack on Next 16), so the
 *                 webpack graph of the same files is proven too
 *
 * Per framework and page:
 *
 *   1. scaffold — the Terminal fence's create command (the page may show none; then
 *      the `DEFAULT_SCAFFOLDS` entry), with only the flags that
 *      answer its prompts the way Enter would (`plan.mjs` SCAFFOLDERS). Cached
 *      per command under the temp dir, so a second run starts from a copy.
 *   2. install — the page's titled fences are written over the scaffold, every
 *      `@comvi/*` is pinned to a LOCAL tarball through `pnpm.overrides`, and
 *      the lockfile is checked to prove no `@comvi` package came off the
 *      registry (the `examples-verify.mjs` provenance assertion, reused).
 *   3. build — the scaffold's own `build` script.
 *   4. typecheck — the framework's checker.
 *   5. render — the built app is served, opened in headless Chromium, and the
 *      greeting must be on the page (Vanilla: on the page or in the console).
 *      Connect to Comvi runs against a local static CDN in the platform's
 *      layout, substituted for the page's `https://cdn.comvi.io/<project-token>`.
 *
 * A failure is a finding about the DOCS unless the report says otherwise: the
 * harness never edits a fence to make it pass.
 */

import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  REPO_ROOT,
  assertTarballsFresh,
  cleanTarballs,
  tarballFor,
  workspacePackages,
} from "../docs-snippets/link-sdk.mjs";
import { assertLocalResolutions } from "../examples-verify.mjs";
import {
  CDN_CATALOG,
  FRAMEWORKS,
  PAGES,
  QUIET_ENV,
  TOOLCHAIN,
  expectation,
  fenceForLine,
  firstFailingLine,
  parseTerminal,
  nonInteractive,
  splitCommands,
  DEFAULT_SCAFFOLDS,
  planPage,
  renderTable,
  stripAnsi,
  substituteCdn,
} from "./plan.mjs";

const CACHE_ROOT = path.join(os.tmpdir(), "comvi-docs-quickstart");
const CDN_TOKEN = "docs-quickstart";

export function parseArgs(argv) {
  const options = {
    content: null,
    only: null,
    sdkRoot: REPO_ROOT,
    build: true,
    pack: true,
    fresh: false,
    keep: false,
    jobs: 3,
    nextWebpack: false,
  };
  const value = (flag, index) => {
    const next = argv[index];
    if (next === undefined || next.startsWith("--")) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--content") options.content = path.resolve(value(arg, ++index));
    else if (arg === "--only") options.only = value(arg, ++index).split(",").filter(Boolean);
    else if (arg === "--sdk-root") options.sdkRoot = path.resolve(value(arg, ++index));
    else if (arg === "--no-build") options.build = false;
    else if (arg === "--no-pack") options.pack = false;
    else if (arg === "--fresh") options.fresh = true;
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--next-webpack") options.nextWebpack = true;
    else if (arg === "--jobs") options.jobs = Math.max(1, Number(value(arg, ++index)) || 1);
    else throw new Error(`unknown argument "${arg}"`);
  }
  if (!options.content) throw new Error("--content <dir> is required");
  const known = new Set(FRAMEWORKS.map((fw) => fw.key));
  const unknown = (options.only ?? []).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `unknown framework(s) ${unknown.join(", ")}: expected ${[...known].join(", ")}`,
    );
  }
  return options;
}

/** Run a command to completion, capturing output. Never throws on a non-zero exit. */
function exec(command, args, { cwd, env = {}, timeout = 15 * 60_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...QUIET_ENV, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      output += `\n[docs-quickstart] timed out after ${timeout / 1000}s`;
      child.kill("SIGKILL");
    }, timeout);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status: status ?? 1, output });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 1, output: `${output}\n${error.message}` });
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** The local CDN: `{base}/{locale}.json`, CORS-open, counting hits. */
async function startCdn() {
  const hits = [];
  const server = http.createServer((request, response) => {
    const match = request.url?.match(new RegExp(`^/${CDN_TOKEN}/([A-Za-z-]+)\\.json(?:\\?.*)?$`));
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "*");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    hits.push(request.url);
    const catalog = match ? CDN_CATALOG[match[1]] : null;
    if (!catalog) {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end("{}");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(catalog));
  });
  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${port}/${CDN_TOKEN}`, hits, close: () => server.close() };
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

const scaffolds = new Map();

/**
 * Scaffold once per exact command; later runs copy the cached tree. Memoized
 * per run as well, because both pages of a framework share one scaffold and
 * run in parallel: two scaffolders racing in one cache directory delete each
 * other's work.
 */
function scaffold(step, options) {
  const key = step.argv.join(" ");
  if (!scaffolds.has(key)) scaffolds.set(key, scaffoldOnce(step, options));
  return scaffolds.get(key);
}

async function scaffoldOnce(step, options) {
  const key = createHash("sha256").update(step.argv.join(" ")).digest("hex").slice(0, 12);
  const cacheDir = path.join(CACHE_ROOT, "scaffolds", key);
  const ready = path.join(cacheDir, ".ready");
  const projectDir = path.join(cacheDir, step.dir);
  if (!options.fresh && fs.existsSync(ready)) return { status: 0, output: "cached", projectDir };

  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  // An empty HOME, so `create-next-app --yes` cannot pick up the saved answers
  // of whoever last ran it here; the npm cache stays where it is.
  const home = path.join(cacheDir, ".home");
  fs.mkdirSync(home);
  const npmCache = path.join(os.homedir(), ".npm");
  const [command, ...args] = step.argv;
  const result = await exec(command, args, {
    cwd: cacheDir,
    env: { HOME: home, npm_config_cache: npmCache },
    timeout: 5 * 60_000,
  });
  if (result.status === 0 && !fs.existsSync(path.join(projectDir, "package.json"))) {
    return { status: 1, output: `${result.output}\nno package.json in ${projectDir}`, projectDir };
  }
  if (result.status === 0) fs.writeFileSync(ready, step.argv.join(" "));
  return { ...result, projectDir };
}

/** Write the page's files, the local-tarball overrides and the install deps. */
function prepareProject(dir, plan, packages, cdnUrl) {
  for (const file of plan.files.values()) {
    const abs = path.join(dir, file.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    let content = file.content;
    if (cdnUrl) {
      const substituted = substituteCdn(content, cdnUrl);
      if (substituted.stray) {
        throw new Error(
          `${file.page}:${file.line} \`${file.rel}\` points at cdn.comvi.io in a form other than ` +
            "the `<project-token>` placeholder; the gate will not build an app that fetches production",
        );
      }
      content = substituted.content;
    }
    fs.writeFileSync(abs, content);
  }

  const manifestPath = path.join(dir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.dependencies ??= {};
  for (const spec of plan.installs) {
    const name = spec.startsWith("@") ? `@${spec.slice(1).split("@")[0]}` : spec.split("@")[0];
    const pkg = packages.find((entry) => entry.name === name);
    if (pkg) manifest.dependencies[name] = `file:${tarballFor(pkg)}`;
    else manifest.dependencies[name] ??= spec.slice(name.length + 1) || "latest";
  }
  // `@comvi/core` as a direct dependency. npm hoists the binding's core to the
  // root, where `@comvi/plugin-fetch-loader`'s core PEER finds it. pnpm instead
  // auto-installs the peer as its own resolution, which `pnpm.overrides` does
  // not reach: the first run of this gate pulled `@comvi/core@0.4.0` off the
  // registry for exactly that peer, and the provenance check caught it.
  const core = packages.find((entry) => entry.name === "@comvi/core");
  if (core) manifest.dependencies["@comvi/core"] = `file:${tarballFor(core)}`;
  manifest.devDependencies = { ...manifest.devDependencies, ...plan.extraDevDeps };
  const overrides = {};
  for (const pkg of packages) overrides[pkg.name] = `file:${tarballFor(pkg)}`;
  manifest.pnpm = { ...manifest.pnpm, overrides };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // Same reasoning as examples-verify.mjs: outside every workspace, and a flat
  // node_modules because the page tells the reader to use npm.
  fs.writeFileSync(
    path.join(dir, ".npmrc"),
    "ignore-workspace=true\nnode-linker=hoisted\nauto-install-peers=true\n",
  );
  return Object.keys(manifest.dependencies).filter((name) => name.startsWith("@comvi/"));
}

async function waitForServer(url, child, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false;
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

let browserPromise = null;
async function browser() {
  if (!browserPromise) {
    browserPromise = import("playwright").then(({ chromium }) => chromium.launch());
  }
  return browserPromise;
}

/** Serve the build, open it in Chromium, and look for the greeting. */
async function render(dir, fw, page) {
  const want = expectation(fw, page);
  const port = await freePort();
  const serve = TOOLCHAIN[fw].serve(port);
  const child = spawn("pnpm", serve.argv, {
    cwd: dir,
    env: { ...process.env, ...QUIET_ENV, ...serve.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let serverLog = "";
  child.stdout.on("data", (chunk) => (serverLog += chunk));
  child.stderr.on("data", (chunk) => (serverLog += chunk));
  const url = `http://${serve.host ?? "127.0.0.1"}:${port}${want.path}`;
  try {
    if (!(await waitForServer(url, child))) {
      return { status: 1, output: `server did not answer ${url}\n${serverLog}` };
    }
    const context = await (await browser()).newContext();
    const tab = await context.newPage();
    const consoleLines = [];
    const errors = [];
    tab.on("console", (message) => consoleLines.push(message.text()));
    tab.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    const fail = (line) => ({
      status: 1,
      output: [
        line,
        ...errors,
        ...consoleLines.map((entry) => `console: ${entry}`),
        serverLog,
      ].join("\n"),
    });
    // Polls the page (and, for Vanilla, the console) for `text` for up to 10 s.
    const waitForText = async (text) => {
      let seen = "";
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        try {
          seen = await tab.evaluate(() => document.body?.innerText ?? "");
        } catch {
          // Mid-navigation (e.g. "Execution context was destroyed" after the
          // Switch click): the next poll reads the new page.
          seen = "";
        }
        const where = `${seen}\n${want.where.includes("console") ? consoleLines.join("\n") : ""}`;
        if (where.includes(text)) return { found: true, seen };
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return { found: false, seen };
    };
    try {
      const response = await tab.goto(url, { waitUntil: "load", timeout: 30_000 });
      const first = await waitForText(want.text);
      if (!first.found) {
        const visible = first.seen.replace(/\s+/g, " ").trim().slice(0, 160);
        const rawKey = /\bgreeting\b/.test(first.seen)
          ? " (the raw key `greeting` is on the page)"
          : "";
        return fail(
          `error: "${want.text}" not in ${want.where} at ${url} (HTTP ${response?.status()})${rawKey}; ` +
            `page text: "${visible}"`,
        );
      }
      let output = `HTTP ${response?.status()} ${url}: "${want.text}" found`;
      if (want.htmlAttrs) {
        // The server's document, not the live DOM: a client-side write would
        // hide a server render that shipped `<html>` bare.
        const html = (await response?.text()) ?? "";
        const tag = html.match(/<html\b[^>]*>/i)?.[0] ?? "(no <html> tag)";
        for (const [name, value] of Object.entries(want.htmlAttrs)) {
          if (!new RegExp(`\\s${name}="${value}"`).test(tag)) {
            return fail(`error: server HTML at ${url} has ${tag}, expected ${name}="${value}"`);
          }
        }
        output += `; server ${tag}`;
      }
      if (!want.switchTo) return { status: 0, output };

      const { link, path: switchPath, text } = want.switchTo;
      await tab.getByRole("link", { name: link }).click({ timeout: 10_000 });
      const switched = await waitForText(text);
      const at = new URL(tab.url()).pathname;
      if (switched.found && at === switchPath) {
        return { status: 0, output: `${output}; "${link}" -> ${at}: "${text}" found` };
      }
      const visible = switched.seen.replace(/\s+/g, " ").trim().slice(0, 160);
      return fail(
        `error: after clicking "${link}", "${text}" not on the page at ${at} ` +
          `(expected ${switchPath}); page text: "${visible}"`,
      );
    } catch (error) {
      // A navigation that never settles (a redirect loop is
      // net::ERR_TOO_MANY_REDIRECTS) is this project's failed render, not the
      // end of the whole run.
      return fail(`error: ${String(error?.message ?? error).split("\n")[0]} (${url})`);
    } finally {
      await context.close();
    }
  } finally {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

/** The combined plan for one framework and page (connect layers on quick start). */
export function projectPlan(pagePlans, fw, pageKey) {
  const page = PAGES.find((entry) => entry.key === pageKey);
  const chain = page.base ? [page.base, pageKey] : [pageKey];
  const files = new Map();
  const terminal = [];
  const notes = [];
  for (const key of chain) {
    const plan = pagePlans.get(key)?.get(fw);
    if (!plan) {
      notes.push(`${key}: no ${fw} tab`);
      continue;
    }
    for (const [rel, file] of plan.files) files.set(rel, file);
    terminal.push(...plan.terminal);
    notes.push(...plan.notes);
  }
  const parsed = parseTerminal(terminal);
  // The page may show only `npm install`; the project still starts from a scaffold.
  const scaffoldSource = parsed.scaffold ? "page" : "default";
  const scaffold = parsed.scaffold ?? nonInteractive(splitCommands([DEFAULT_SCAFFOLDS[fw]])[0]);
  return {
    files,
    scaffold,
    scaffoldSource,
    installs: parsed.installs,
    unknown: parsed.unknown,
    notes,
    extraDevDeps: TOOLCHAIN[fw].extraDevDeps,
  };
}

async function runProject({ fw, page, plan, packages, cdn, options }) {
  const result = { fw, page, steps: {}, notes: [...plan.notes], dir: null };
  const record = (step, { status, output }) => {
    const pass = status === 0;
    const line = pass ? "" : firstFailingLine(output);
    result.steps[step] = {
      status: pass ? "pass" : "fail",
      line,
      fence: pass ? null : fenceForLine(line, plan.files),
      output: stripAnsi(output ?? ""),
    };
    return pass;
  };

  if (!plan.scaffold) {
    record("scaffold", {
      status: 1,
      output: "error: the Terminal fence names no scaffold command",
    });
    return result;
  }
  if (plan.unknown.length > 0) {
    result.notes.push(`Terminal lines the gate does not understand: ${plan.unknown.join("; ")}`);
  }
  result.notes.push(`scaffold: ${plan.scaffoldSource}`);
  result.notes.push(`scaffold flags added: ${plan.scaffold.note}`);

  const scaffolded = await scaffold(plan.scaffold, options);
  if (!record("scaffold", scaffolded)) return result;

  const dir = fs.mkdtempSync(path.join(CACHE_ROOT, `run-${fw}-${page}-`));
  result.dir = dir;
  try {
    copyTree(scaffolded.projectDir, dir);
    let declared;
    try {
      declared = prepareProject(dir, plan, packages, page === "connect-comvi" ? cdn.url : null);
    } catch (error) {
      record("install", { status: 1, output: `error: ${error.message}` });
      return result;
    }

    const install = await exec("pnpm", ["install", "--no-frozen-lockfile", "--ignore-workspace"], {
      cwd: dir,
    });
    if (install.status === 0) {
      try {
        assertLocalResolutions(fs.readFileSync(path.join(dir, "pnpm-lock.yaml"), "utf8"), declared);
      } catch (error) {
        install.status = 1;
        install.output += `\nerror: provenance: ${error.message}`;
      }
    }
    if (!record("install", install)) return result;

    const tools = TOOLCHAIN[fw];
    const build = fw === "next" && options.nextWebpack ? tools.webpackBuild : tools.build;
    const built = record("build", await exec("pnpm", build, { cwd: dir }));
    record("typecheck", await exec("pnpm", tools.typecheck, { cwd: dir }));
    if (built) record("render", await render(dir, fw, page));
    return result;
  } finally {
    if (!options.keep) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function pool(tasks, size) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
  return results;
}

async function main(argv) {
  const started = Date.now();
  const options = parseArgs(argv);
  const pagePlans = new Map();
  for (const page of PAGES) {
    const file = path.join(options.content, page.file);
    if (!fs.existsSync(file)) throw new Error(`no ${page.file} under ${options.content}`);
    pagePlans.set(page.key, planPage(fs.readFileSync(file, "utf8"), page.key, page.file));
  }

  if (options.build) {
    const built = await exec("pnpm", ["build"], { cwd: options.sdkRoot });
    if (built.status !== 0) throw new Error(`pnpm build failed\n${built.output}`);
  }
  if (options.pack) {
    cleanTarballs(options.sdkRoot);
    const packed = await exec("pnpm", ["pack:release"], { cwd: options.sdkRoot });
    if (packed.status !== 0) throw new Error(`pnpm pack:release failed\n${packed.output}`);
  }
  const packages = workspacePackages(options.sdkRoot);
  if (!options.pack) assertTarballsFresh(packages);

  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  const cdn = await startCdn();
  const frameworks = FRAMEWORKS.filter((fw) => !options.only || options.only.includes(fw.key));
  const tasks = [];
  for (const fw of frameworks) {
    for (const page of PAGES) {
      const plan = projectPlan(pagePlans, fw.key, page.key);
      tasks.push(async () => {
        console.error(`docs-quickstart: ${fw.key} / ${page.key}...`);
        const result = await runProject({
          fw: fw.key,
          page: page.key,
          plan,
          packages,
          cdn,
          options,
        });
        const verdict = Object.values(result.steps).every((step) => step.status === "pass")
          ? "pass"
          : "FAIL";
        console.error(`docs-quickstart: ${fw.key} / ${page.key}: ${verdict}`);
        return result;
      });
    }
  }

  let results;
  try {
    results = await pool(tasks, options.jobs);
  } finally {
    cdn.close();
    if (browserPromise) await (await browserPromise).close();
  }

  console.log(renderTable(results));
  const notes = results.flatMap((result) =>
    result.notes.map((note) => `- ${result.fw} / ${result.page}: ${note}`),
  );
  if (notes.length > 0) console.log(`\nNotes:\n${[...new Set(notes)].join("\n")}`);
  const cdnHits = cdn.hits.length;
  console.log(`\nLocal CDN ${cdn.url} served ${cdnHits} request(s).`);
  console.log(`Wall time: ${Math.round((Date.now() - started) / 1000)}s`);
  if (options.keep) {
    for (const result of results) if (result.dir) console.log(`kept: ${result.dir}`);
  }

  const failed = results.some(
    (result) =>
      Object.keys(result.steps).length === 0 ||
      Object.values(result.steps).some((step) => step.status !== "pass") ||
      !result.steps.render,
  );
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`docs-quickstart: ${error.message}`);
    process.exitCode = 2;
  }
}
