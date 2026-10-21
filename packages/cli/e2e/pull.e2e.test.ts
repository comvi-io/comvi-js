import { access } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createProject, createWorkspace, runCli, type E2EProject, type Workspace } from "./harness";

let project: E2EProject;
const workspaces: Workspace[] = [];

beforeAll(async () => {
  // The restricted fixture user may read en and es only.
  project = await createProject({ locales: ["de", "es"] });
  const seed = await createWorkspace({ translationsPath: "./src/locales" });
  await seed.write("src/locales/en.json", { greeting: "Hello" });
  await seed.write("src/locales/de.json", { greeting: "Hallo" });
  await seed.write("src/locales/es.json", { greeting: "Hola" });
  try {
    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: seed.dir,
      apiKey: project.keys.full,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);
  } finally {
    await seed.cleanup();
  }
});

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => workspace.cleanup()));
});

async function workspace(config: object = { translationsPath: "./src/locales" }) {
  const ws = await createWorkspace(config);
  workspaces.push(ws);
  return ws;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

describe("comvi pull --empty-dir", () => {
  it("replaces the files it fetched and keeps everything else", async () => {
    const ws = await workspace();
    await ws.write("src/locales/index.ts", "export const x = 1;\n");
    await ws.write("src/locales/en.json", { stale: "yes" });
    // fr is not a project locale: the pull fetched nothing for it to replace.
    await ws.write("src/locales/fr.json", { kept: "yes" });

    const result = await runCli(["pull", "--empty-dir"], {
      cwd: ws.dir,
      apiKey: project.keys.full,
    });

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await ws.read("src/locales/index.ts")).toBe("export const x = 1;\n");
    expect(await ws.readJson("src/locales/fr.json")).toEqual({ kept: "yes" });
    expect(await ws.readJson("src/locales/en.json")).toEqual({ greeting: "Hello" });
  });

  it("leaves source code alone when the path is the whole src directory", async () => {
    const ws = await workspace();
    await ws.write("src/components/App.tsx", "export const App = 1;\n");

    const result = await runCli(["pull", "--empty-dir", "-p", "src"], {
      cwd: ws.dir,
      apiKey: project.keys.full,
    });

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await ws.read("src/components/App.tsx")).toBe("export const App = 1;\n");
    expect(await ws.readJson("src/en.json")).toEqual({ greeting: "Hello" });
  });
});

describe("comvi pull with a language-restricted key", () => {
  it("writes only the locales the key may read", async () => {
    const ws = await workspace();

    const result = await runCli(["pull"], { cwd: ws.dir, apiKey: project.keys.restricted });

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await ws.readJson("src/locales/es.json")).toEqual({ greeting: "Hola" });
    expect(await exists(join(ws.dir, "src/locales/de.json"))).toBe(false);
  });

  // The platform lists only the readable locales to such a key, so a
  // forbidden locale looks like one the project does not have.
  it("exits 4 when asked for a locale the key may not read, naming those it may", async () => {
    const ws = await workspace();

    const result = await runCli(["pull", "--locale", "de"], {
      cwd: ws.dir,
      apiKey: project.keys.restricted,
    });

    expect(result.code, result.stdout + result.stderr).toBe(4);
    expect(result.stderr).toContain("Available with this API key: en, es");
    expect(await exists(join(ws.dir, "src/locales/de.json"))).toBe(false);
  });
});
