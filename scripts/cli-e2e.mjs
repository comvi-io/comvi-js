#!/usr/bin/env node
/**
 * Runs `packages/cli/e2e` against a real platform API.
 *
 * The platform checkout (PLATFORM_DIR, default ../platform) owns the stack:
 * `apps/api/scripts/test-stack.mjs --serve <port>` starts Postgres and Redis
 * under its own compose project, migrates, seeds and boots the API; then
 * `scripts/cli-e2e-fixture.ts` adds a writable organization and the suite runs
 * the built `packages/cli/bin/comvi.js`. The stack is torn down afterwards,
 * including on Ctrl-C.
 *
 *   PLATFORM_DIR=../platform node scripts/cli-e2e.mjs [vitest args...]
 *
 * Needs Docker, Node 24 and `pnpm install` in both checkouts, and a built CLI
 * (`pnpm --filter @comvi/cli... build`).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const platformDir = resolve(root, process.env.PLATFORM_DIR ?? "../platform");
const apiDir = join(platformDir, "apps/api");
const testStack = join(apiDir, "scripts/test-stack.mjs");
const fixtureScript = join(apiDir, "scripts/cli-e2e-fixture.ts");
const cliBin = join(root, "packages/cli/dist/cli.js");

for (const [path, hint] of [
  [testStack, "set PLATFORM_DIR to a platform checkout"],
  [fixtureScript, "the platform checkout predates scripts/cli-e2e-fixture.ts"],
  [cliBin, "build the CLI first: pnpm --filter @comvi/cli... build"],
]) {
  if (!existsSync(path)) {
    console.error(`cli-e2e: missing ${path} (${hint})`);
    process.exit(2);
  }
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
const fixtureOut = join(workDir, "fixture.json");
const vitestArgs = process.argv.slice(2).map((arg) => `'${arg.replaceAll("'", "'\\''")}'`);

const inner = [
  `pnpm exec tsx scripts/cli-e2e-fixture.ts`,
  `pnpm --dir '${join(root, "packages/cli")}' exec vitest run --config vitest.e2e.config.ts ${vitestArgs.join(" ")}`,
].join(" && ");

const child = spawn(process.execPath, [testStack, "--serve", port, "--", "sh", "-c", inner], {
  cwd: apiDir,
  stdio: "inherit",
  env: {
    LOG_LEVEL: "warn",
    ...process.env,
    CLI_E2E_FIXTURE_OUT: fixtureOut,
    CLI_E2E_FIXTURE: fixtureOut,
    COMVI_E2E_API_URL: `http://localhost:${port}`,
  },
});

// test-stack.mjs tears its stack down on SIGINT/SIGTERM; forward, never kill.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("close", async (code, signal) => {
  await rm(workDir, { recursive: true, force: true });
  process.exit(code ?? (signal ? 1 : 0));
});
