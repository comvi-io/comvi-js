import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_VERSION } from "../../src/utils/version";
import { makeTempDir, removeTempDirs } from "../helpers";

/**
 * `src/cli/index.ts` wires commander and the env preAction hook at module scope
 * and calls `program.parse()` on import, so it cannot be driven in-process — an
 * import would parse vitest's own argv. These cases run the BUILT bin instead,
 * which is also the only way to observe the real process exit codes.
 *
 * Needs `pnpm build` (turbo's `test` task depends on it); skipped rather than
 * failed when dist is absent, so a direct `pnpm test` on a clean checkout works.
 */

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BIN = join(PKG_ROOT, "bin", "comvi.js");
const BUILT_CLI = join(PKG_ROOT, "dist", "cli.js");

interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  const env = { ...process.env, ...options.env };
  for (const key of ["COMVI_API_KEY", "COMVI_API_BASE_URL", "COMVI_DEBUG", "COMVI_NO_ENV"]) {
    if (!(key in (options.env ?? {}))) {
      delete env[key];
    }
  }

  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: options.cwd ?? PKG_ROOT,
    encoding: "utf8",
    env,
    timeout: 30_000,
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr } satisfies CliRun;
}

/** Command names from the `Commands:` section, ignoring wrapped description lines. */
function listedCommands(help: string): string[] {
  const section = help.split("Commands:")[1] ?? "";
  return [...section.matchAll(/^ {2}(\S+)/gm)].map((match) => match[1]);
}

describe.skipIf(!existsSync(BUILT_CLI))("comvi entry point (built bin)", () => {
  afterEach(removeTempDirs);

  it("prints the package version for --version", () => {
    const run = runCli(["--version"]);

    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe(CLI_VERSION);
  });

  it("registers every command, in order, on the root program", () => {
    const run = runCli(["--help"]);

    expect(run.status).toBe(0);
    expect(listedCommands(run.stdout)).toEqual([
      "init",
      "typegen",
      "generate-types",
      "generate",
      "pull",
      "push",
      "help",
    ]);
  });

  it("exits 1 on an unknown command", () => {
    const run = runCli(["nope"]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("unknown command 'nope'");
  });

  it("refuses a missing dotenv file with our own exit 4, not node's exit 9", async () => {
    const dir = await makeTempDir("comvi-entry");
    const missing = join(dir, "absent.env");

    const run = runCli(["--dotenv", missing, "typegen", "-c", join(dir, "none.json")]);

    expect(run.status).toBe(4);
    expect(run.stderr).toContain(`✗ --dotenv points to a missing file: ${missing}`);
  });

  it("loads the file named by --dotenv before the command runs", async () => {
    const dir = await makeTempDir("comvi-entry");
    const dotenvFile = join(dir, "custom.env");
    await fs.writeFile(dotenvFile, "COMVI_API_KEY=from-dotenv\n");

    const run = runCli(["--dotenv", dotenvFile, "typegen", "-c", join(dir, "none.json")], {
      env: { COMVI_DEBUG: "1" },
    });

    expect(run.stderr).toContain(`[comvi] loaded env from ${dotenvFile} (1 added, 0 skipped`);
  });

  it("loads nothing when --no-dotenv is given, even with a .env next to it", async () => {
    const dir = await makeTempDir("comvi-entry");
    await fs.writeFile(join(dir, ".env"), "COMVI_API_KEY=from-dot-env\n");

    const run = runCli(["--no-dotenv", "typegen", "-c", join(dir, "none.json")], {
      cwd: dir,
      env: { COMVI_DEBUG: "1" },
    });

    expect(run.stderr).not.toContain("loaded env from");
    expect(run.stderr).toContain("✗ Error: Config file not found");
  });
});
