import { rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  API_URL,
  createProject,
  createWorkspace,
  runCli,
  startProxy,
  type E2EProject,
  type Proxy,
  type Workspace,
} from "./harness";

// 0 ok, 1 conflict or outdated types, 2 API unavailable, 3 bad key or access, 4 usage.
let project: E2EProject;
let proxy: Proxy;
const workspaces: Workspace[] = [];

const BOGUS_KEY = `comvi_${"0".repeat(64)}`;

beforeAll(async () => {
  project = await createProject();
  proxy = await startProxy();
});

afterAll(() => proxy.close());

afterEach(async () => {
  proxy.up();
  await Promise.all(workspaces.splice(0).map((workspace) => workspace.cleanup()));
});

async function workspace() {
  const ws = await createWorkspace({ translationsPath: "./src/locales" });
  workspaces.push(ws);
  await ws.write("src/locales/en.json", { a: "A" });
  return ws;
}

describe("exit 3: the key", () => {
  it.each([["pull"], ["push", "--force-mode", "override"], ["typegen"], ["typegen", "--check"]])(
    "comvi %s with a key the platform does not know",
    async (...args) => {
      const ws = await workspace();

      const result = await runCli(args, { cwd: ws.dir, apiKey: BOGUS_KEY });

      expect(result.code, result.stdout + result.stderr).toBe(3);
    },
  );

  it("typegen with a key that lacks schema:read names the scope", async () => {
    const ws = await workspace();

    const result = await runCli(["typegen"], { cwd: ws.dir, apiKey: project.keys.noschema });

    expect(result.code, result.stdout + result.stderr).toBe(3);
    expect(result.stderr).toContain("schema:read");
  });
});

describe("exit 2: the API is unavailable", () => {
  it("names the network cause when nothing listens", async () => {
    const ws = await workspace();
    const closedPort = await new Promise<number>((resolvePort) => {
      const server = createServer().listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        server.close(() => resolvePort(port));
      });
    });

    const result = await runCli(["pull"], {
      cwd: ws.dir,
      apiKey: project.keys.full,
      env: { COMVI_API_BASE_URL: `http://127.0.0.1:${closedPort}` },
    });

    expect(result.code, result.stdout + result.stderr).toBe(2);
    expect(result.stderr).toContain("ECONNREFUSED");
  });

  it("when a gateway in front of the API answers 502", async () => {
    const ws = await workspace();
    proxy.down();

    const result = await runCli(["pull"], {
      cwd: ws.dir,
      apiKey: project.keys.full,
      env: { COMVI_API_BASE_URL: proxy.url },
    });

    expect(result.code, result.stdout + result.stderr).toBe(2);
  });
});

describe("exit 4: usage", () => {
  it.each([["no-such-command"], ["pull", "--no-such-option"]])("comvi %s", async (...args) => {
    const ws = await workspace();

    const result = await runCli(args, { cwd: ws.dir, apiKey: project.keys.full });

    expect(result.code, result.stdout + result.stderr).toBe(4);
  });
});

describe("comvi init", () => {
  it("checks the key against COMVI_API_BASE_URL and writes it to the config", async () => {
    const ws = await workspace();
    await rm(join(ws.dir, ".comvirc.json"));

    const result = await runCli(["init"], { cwd: ws.dir, apiKey: project.keys.full });

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect((await ws.readJson<{ apiBaseUrl: string }>(".comvirc.json")).apiBaseUrl).toBe(API_URL);
  });
});
