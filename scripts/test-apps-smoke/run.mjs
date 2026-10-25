#!/usr/bin/env node
/**
 * `pnpm test-apps:smoke`: build the Next and Nuxt test apps against the
 * workspace packages, serve each production build, and check what a reader
 * would get over plain HTTP.
 *
 * Why it exists: `packages/next` and `packages/nuxt` are unit-tested against
 * the UPPER major of their `next` / `nuxt` peer ranges (their devDependencies).
 * The lower majors are proven only here, by real apps on Next 15 and Nuxt 3,
 * next to Next 16 and Nuxt 4:
 *
 *   test-apps/next     Next 15, middleware.ts
 *   test-apps/next16   Next 16, proxy.ts
 *   test-apps/nuxt     Nuxt 3
 *   test-apps/nuxt4    Nuxt 4, plus a Nitro route using the server utilities
 *
 * Fails closed: a missing build, a server that does not come up, a status,
 * redirect, `<html lang>` or text that differs from the expectation, or an
 * installed framework of the wrong major, is a failure. Exit 1 on any.
 *
 *   node scripts/test-apps-smoke/run.mjs [--only <app>[,<app>]] [--no-build]
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const EN_TITLE = "Comvi i18n Example";
const UK_TITLE = "Приклад Comvi i18n";
const UK_HOME = "Головна";
const AR_TITLE = "مثال Comvi i18n";

/** What every app must do: the locale routing and SSR text, framework-neutral. */
function commonChecks({ lang }) {
  return [
    {
      name: "/ is English",
      path: "/",
      status: 200,
      lang: lang.en,
      has: [EN_TITLE],
      hasNot: [UK_TITLE],
    },
    {
      name: "/uk is Ukrainian in the SSR HTML",
      path: "/uk",
      status: 200,
      lang: lang.uk,
      has: [UK_TITLE, UK_HOME],
      hasNot: [EN_TITLE],
    },
    {
      name: "/ar is Arabic",
      path: "/ar",
      status: 200,
      lang: lang.ar,
      has: [AR_TITLE],
      ...(lang.arDir ? { dir: "rtl" } : {}),
    },
    { name: "/en redirects to the unprefixed default", path: "/en", redirect: "/" },
    { name: "/en/plurals redirects to /plurals", path: "/en/plurals", redirect: "/plurals" },
    {
      name: "Accept-Language: uk on / redirects to /uk",
      path: "/",
      headers: { "accept-language": "uk" },
      redirect: "/uk",
    },
    { name: "an unknown locale segment is a 404", path: "/xx", status: 404 },
  ];
}

const NEXT_LANG = { en: "en", uk: "uk", ar: "ar" };
const NUXT_LANG = { en: "en-US", uk: "uk-UA", ar: "ar-SA", arDir: true };

const APPS = {
  next: { kind: "next", framework: "next", major: 15, checks: commonChecks({ lang: NEXT_LANG }) },
  next16: {
    kind: "next",
    framework: "next",
    major: 16,
    // Next 16 runs `src/proxy.ts`; the redirects above come from it.
    requireFiles: ["src/proxy.ts"],
    forbidFiles: ["src/middleware.ts"],
    checks: commonChecks({ lang: NEXT_LANG }),
  },
  nuxt: { kind: "nuxt", framework: "nuxt", major: 3, checks: commonChecks({ lang: NUXT_LANG }) },
  nuxt4: {
    kind: "nuxt",
    framework: "nuxt",
    major: 4,
    checks: [
      ...commonChecks({ lang: NUXT_LANG }),
      {
        name: "Nitro /api/translate follows Accept-Language: uk",
        path: "/api/translate",
        headers: { "accept-language": "uk" },
        status: 200,
        json: { locale: "uk", home: UK_HOME, adminTitle: "Панель адміністратора", hasHome: true },
      },
      {
        name: "Nitro /api/translate follows the locale cookie (de)",
        path: "/api/translate",
        headers: { cookie: "i18n_locale=de" },
        status: 200,
        json: { locale: "de", home: "Startseite", adminTitle: "Admin-Dashboard", hasHome: true },
      },
    ],
  },
};

function parseArgs(argv) {
  const args = { only: Object.keys(APPS), build: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-build") args.build = false;
    else if (arg === "--only") {
      args.only = String(argv[(i += 1)] ?? "")
        .split(",")
        .filter(Boolean);
      const unknown = args.only.filter((name) => !APPS[name]);
      if (unknown.length > 0 || args.only.length === 0) {
        throw new Error(
          `--only takes ${Object.keys(APPS).join(", ")}; got ${unknown.join(", ") || "nothing"}`,
        );
      }
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startServer(app, dir, port) {
  const [command, args] =
    app.kind === "next"
      ? [
          process.execPath,
          // No `-H 127.0.0.1`: with that bind, both Next 15.5 and 16.4 answer
          // `/` with a 307 to `/` (the as-needed rewrite to `/en` comes back
          // through the middleware). Default bind and `-H localhost` do not.
          [path.join(dir, "node_modules/next/dist/bin/next"), "start", "-p", String(port)],
        ]
      : [process.execPath, [path.join(dir, ".output/server/index.mjs")]];
  const log = [];
  // Its own process group, so stopping it also stops anything it forked.
  const child = spawn(command, args, {
    cwd: dir,
    detached: true,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => log.push(String(chunk)));
  child.stderr.on("data", (chunk) => log.push(String(chunk)));
  const exited = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  return {
    child,
    log,
    exited,
    stop() {
      if (child.exitCode !== null || child.signalCode !== null) return exited;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
      return exited;
    },
  };
}

async function waitUntilUp(server, base) {
  const deadline = Date.now() + 60_000;
  let exitedEarly = null;
  server.exited.then((info) => (exitedEarly = info));
  while (Date.now() < deadline) {
    if (exitedEarly)
      throw new Error(`server exited before answering (${JSON.stringify(exitedEarly)})`);
    try {
      await fetch(`${base}/`, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("server did not answer within 60 s");
}

function htmlAttr(body, attr) {
  const tag = /<html\b[^>]*>/i.exec(body)?.[0];
  if (!tag) return undefined;
  return new RegExp(`\\s${attr}="([^"]*)"`, "i").exec(tag)?.[1];
}

/** Every way `response` differs from `check`; empty means it passed. */
export function evaluate(check, response) {
  const problems = [];
  const { status, location, body } = response;
  if (check.redirect !== undefined) {
    if (![301, 302, 303, 307, 308].includes(status))
      problems.push(`status ${status}, expected a redirect`);
    const target = location === null ? null : new URL(location, "http://x").pathname;
    if (target !== check.redirect)
      problems.push(
        `redirects to ${JSON.stringify(target)}, expected ${JSON.stringify(check.redirect)}`,
      );
  }
  if (check.status !== undefined && status !== check.status)
    problems.push(`status ${status}, expected ${check.status}`);
  if (check.lang !== undefined) {
    const lang = htmlAttr(body, "lang");
    if (lang !== check.lang)
      problems.push(
        `<html lang> is ${JSON.stringify(lang)}, expected ${JSON.stringify(check.lang)}`,
      );
  }
  if (check.dir !== undefined) {
    const dir = htmlAttr(body, "dir");
    if (dir !== check.dir)
      problems.push(`<html dir> is ${JSON.stringify(dir)}, expected ${JSON.stringify(check.dir)}`);
  }
  // Text is matched in the markup only: hydration payloads carry the fallback
  // locale's catalog too, and text that exists only there is not on screen.
  const markup = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const text of check.has ?? [])
    if (!markup.includes(text)) problems.push(`missing text ${JSON.stringify(text)}`);
  for (const text of check.hasNot ?? [])
    if (markup.includes(text)) problems.push(`unexpected text ${JSON.stringify(text)}`);
  if (check.json !== undefined) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      problems.push("body is not JSON");
    }
    if (parsed !== undefined) {
      for (const [key, value] of Object.entries(check.json)) {
        if (JSON.stringify(parsed[key]) !== JSON.stringify(value)) {
          problems.push(
            `JSON ${key} is ${JSON.stringify(parsed[key])}, expected ${JSON.stringify(value)}`,
          );
        }
      }
    }
  }
  return problems;
}

function preflight(name, app, dir) {
  const problems = [];
  const manifest = path.join(dir, "node_modules", app.framework, "package.json");
  if (!fs.existsSync(manifest))
    problems.push(`${app.framework} is not installed in test-apps/${name}`);
  else {
    const version = JSON.parse(fs.readFileSync(manifest, "utf8")).version;
    if (Number(version.split(".")[0]) !== app.major) {
      problems.push(
        `test-apps/${name} has ${app.framework}@${version}; it exists to prove ${app.major}.x`,
      );
    }
  }
  const output = app.kind === "next" ? ".next/BUILD_ID" : ".output/server/index.mjs";
  if (!fs.existsSync(path.join(dir, output)))
    problems.push(`no production build (${output}); run without --no-build`);
  for (const file of app.requireFiles ?? [])
    if (!fs.existsSync(path.join(dir, file))) problems.push(`${file} is missing`);
  for (const file of app.forbidFiles ?? [])
    if (fs.existsSync(path.join(dir, file))) problems.push(`${file} must not exist`);
  return problems;
}

async function smoke(name) {
  const app = APPS[name];
  const dir = path.join(ROOT, "test-apps", name);
  const results = [];
  const pre = preflight(name, app, dir);
  if (pre.length > 0) return [{ name: "preflight", problems: pre }];

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server = startServer(app, dir, port);
  try {
    await waitUntilUp(server, base);
    for (const check of app.checks) {
      let problems;
      try {
        const res = await fetch(`${base}${check.path}`, {
          redirect: "manual",
          // An explicit default: undici otherwise sends `accept-language: *`,
          // which the locale detection reads as a preference.
          headers: { "accept-language": "en", ...check.headers },
          signal: AbortSignal.timeout(15_000),
        });
        problems = evaluate(check, {
          status: res.status,
          location: res.headers.get("location"),
          body: await res.text(),
        });
      } catch (error) {
        problems = [`request failed: ${error.message}`];
      }
      results.push({ name: `${check.name} (${check.path})`, problems });
    }
  } catch (error) {
    results.push({ name: "server start", problems: [error.message, ...server.log.slice(-20)] });
  } finally {
    await server.stop();
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.build) {
    const filters = args.only.flatMap((name) => ["--filter", `@test-apps/${name}`]);
    console.log(
      `test-apps-smoke: building ${args.only.join(", ")} (and the workspace packages they depend on)`,
    );
    const build = spawnSync("pnpm", ["exec", "turbo", "run", "build", ...filters], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (build.status !== 0) {
      console.error(`test-apps-smoke: build failed (exit ${build.status})`);
      process.exit(1);
    }
  }

  let failed = 0;
  for (const name of args.only) {
    const results = await smoke(name);
    console.log(`\n${name} (${APPS[name].framework} ${APPS[name].major})`);
    for (const result of results) {
      const ok = result.problems.length === 0;
      if (!ok) failed += 1;
      console.log(`  ${ok ? "ok  " : "FAIL"} ${result.name}`);
      for (const problem of result.problems) console.log(`         ${problem}`);
    }
  }
  if (failed > 0) {
    console.error(`\ntest-apps-smoke: ${failed} check(s) failed`);
    process.exit(1);
  }
  console.log(`\ntest-apps-smoke: all checks passed for ${args.only.join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`test-apps-smoke: ${error.stack ?? error}`);
    process.exit(1);
  });
}
