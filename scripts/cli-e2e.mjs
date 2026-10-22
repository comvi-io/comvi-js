#!/usr/bin/env node
/**
 * Runs `packages/cli/e2e` against a real platform API.
 *
 * The platform checkout (PLATFORM_DIR, default ../platform) owns the stack:
 * `apps/api/scripts/test-stack.mjs --serve <port>` starts Postgres and Redis
 * under its own compose project, migrates, seeds and boots the API, then runs
 * this script again with `--inner`: `scripts/cli-e2e-fixture.ts` adds a
 * writable organization and vitest runs the built `packages/cli/bin/comvi.js`.
 * test-stack tears the stack down afterwards, including on Ctrl-C.
 *
 *   PLATFORM_DIR=../platform node scripts/cli-e2e.mjs [vitest args...]
 *
 * Needs Docker, Node 24, `pnpm install` in both checkouts (each with its own
 * pinned pnpm; corepack picks it per directory) and a built CLI
 * (`pnpm --filter "@comvi/cli..." build`).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = join(root, "packages/cli");
const platformDir = resolve(root, process.env.PLATFORM_DIR ?? "../platform");
const apiDir = join(platformDir, "apps/api");

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("close", (code, signal) => resolveRun(code ?? (signal ? 1 : 0)));
  });
}

if (process.argv[2] === "--inner") {
  // Inside test-stack: env carries the database, the API URL and the fixture path.
  const fixtureCode = await run("pnpm", ["exec", "tsx", "scripts/cli-e2e-fixture.ts"], apiDir);
  if (fixtureCode !== 0) process.exit(fixtureCode);

  const vitestPackage = createRequire(join(cliDir, "package.json")).resolve("vitest/package.json");
  const vitest = join(dirname(vitestPackage), "vitest.mjs");
  const testCode = await run(
    process.execPath,
    [vitest, "run", "--config", "vitest.e2e.config.ts", ...process.argv.slice(3)],
    cliDir,
  );
  process.exit(testCode);
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs);
  }
  return newest;
}

const testStack = join(apiDir, "scripts/test-stack.mjs");
const fixtureScript = join(apiDir, "scripts/cli-e2e-fixture.ts");
const cliBuild = join(cliDir, "dist/cli.js");

for (const [path, hint] of [
  [testStack, "set PLATFORM_DIR to a platform checkout"],
  [fixtureScript, "the platform checkout predates scripts/cli-e2e-fixture.ts"],
  [cliBuild, 'build the CLI first: pnpm --filter "@comvi/cli..." build'],
]) {
  if (!existsSync(path)) {
    console.error(`cli-e2e: missing ${path} (${hint})`);
    process.exit(2);
  }
}

const sources = [join(cliDir, "src"), join(root, "packages/typegen/src")];
if (Math.max(...sources.map(newestMtime)) > statSync(cliBuild).mtimeMs) {
  console.error(
    'cli-e2e: the CLI build is older than its sources; run pnpm --filter "@comvi/cli..." build',
  );
  process.exit(2);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

const port = process.env.CLI_E2E_PORT ?? String(await freePort());
const workDir = await mkdtemp(join(tmpdir(), "comvi-cli-e2e-stack-"));
const fixturePath = join(workDir, "fixture.json");

const child = spawn(
  process.execPath,
  [
    testStack,
    "--serve",
    port,
    "--",
    process.execPath,
    fileURLToPath(import.meta.url),
    "--inner",
    ...process.argv.slice(2),
  ],
  {
    cwd: apiDir,
    stdio: "inherit",
    env: {
      LOG_LEVEL: "warn",
      // A revoked key's watch stream closes within a second, not a minute.
      SSE_TYPEGEN_KEY_RECHECK_MS: "1000",
      ...process.env,
      CLI_E2E_FIXTURE_OUT: fixturePath,
      CLI_E2E_FIXTURE: fixturePath,
      COMVI_E2E_API_URL: `http://localhost:${port}`,
    },
  },
);

// test-stack tears its stack down on SIGINT/SIGTERM. Ctrl-C already reaches it
// through the process group, and a second SIGINT would make it exit before
// `docker compose down` finishes, so SIGINT is ignored here and only SIGTERM
// (which a terminal does not broadcast) is forwarded.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => child.kill("SIGTERM"));

child.on("close", async (code, signal) => {
  await rm(workDir, { recursive: true, force: true });
  process.exit(code ?? (signal ? 1 : 0));
});
