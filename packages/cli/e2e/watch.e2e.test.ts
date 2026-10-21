import { afterEach, describe, expect, it } from "vitest";
import {
  createProject,
  createWorkspace,
  revokeKey,
  runCli,
  startCli,
  startProxy,
  type RunningCli,
  type Workspace,
} from "./harness";

const cleanups: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function workspace(): Promise<Workspace> {
  const ws = await createWorkspace({ translationsPath: "./src/locales" });
  cleanups.push(() => ws.cleanup());
  return ws;
}

function watch(ws: Workspace, apiKey: string, env?: Record<string, string>): RunningCli {
  const cli = startCli(["typegen", "--watch"], { cwd: ws.dir, apiKey, env });
  cleanups.push(() => cli.stop());
  return cli;
}

describe("comvi typegen --watch", () => {
  it("reconnects after the API was unreachable and picks up later changes", async () => {
    const project = await createProject();
    const proxy = await startProxy();
    cleanups.push(() => proxy.close());
    const ws = await workspace();

    const cli = watch(ws, project.keys.full, { COMVI_API_BASE_URL: proxy.url });
    await cli.waitFor(/Watching for changes/);

    proxy.down();
    await cli.waitFor(/reconnecting in/);
    proxy.up();
    await cli.waitFor(/Schema stream reconnected/, 60_000);

    await ws.write("src/locales/en.json", { "after.outage": "Back" });
    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: ws.dir,
      apiKey: project.keys.full,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);

    await cli.waitFor(/Updated \d+ keys/);
    expect(await ws.read("src/types/i18n.d.ts")).toContain('"after.outage"');
  });

  it("exits 3 once its key is revoked", async () => {
    const project = await createProject();
    const ws = await workspace();

    const cli = watch(ws, project.keys.full);
    await cli.waitFor(/Watching for changes/);
    await revokeKey(project, "full");

    // The platform re-checks the key every SSE_TYPEGEN_KEY_RECHECK_MS (1 s here).
    const code = await Promise.race([
      cli.exited,
      new Promise((resolveTimeout) => setTimeout(() => resolveTimeout("timeout"), 30_000)),
    ]);
    expect(code, cli.output()).toBe(3);
    expect(cli.output()).toContain("Watch stopped");
  });
});
