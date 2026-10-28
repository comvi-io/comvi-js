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
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
});

async function workspace(): Promise<Workspace> {
  const ws = await createWorkspace({ translationsPath: "./src/locales" });
  cleanups.push(() => ws.cleanup());
  return ws;
}

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition().catch(() => false))) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
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

    const beforeOutage = cli.mark();
    proxy.down();
    await cli.waitFor(/reconnecting in/, { since: beforeOutage });
    proxy.up();
    await cli.waitFor(/schema stream reconnected/, { since: beforeOutage, timeoutMs: 60_000 });

    await ws.write("src/locales/en.json", { "after.outage": "Back" });
    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: ws.dir,
      apiKey: project.keys.full,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);

    // Every (re)connect regenerates the types too, so wait for the file itself.
    await waitUntil(async () => (await ws.read("src/types/i18n.d.ts")).includes('"after.outage"'));
  });

  it("exits 3 once its key is revoked", async () => {
    const project = await createProject();
    const ws = await workspace();

    const cli = watch(ws, project.keys.full);
    await cli.waitFor(/Watching for changes/);
    await revokeKey(project, "full");

    // The platform re-checks the key every SSE_TYPEGEN_KEY_RECHECK_MS (1 s here).
    expect(await cli.exitedWithin(30_000), cli.output()).toBe(3);
    expect(cli.output()).toContain("Watch stopped");
  });
});
