import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  SCHEMA_V2,
  createProject,
  createWorkspace,
  fetchRemote,
  runCli,
  type E2EProject,
  type Workspace,
} from "./harness";

describe("comvi against a real platform API", () => {
  let project: E2EProject;
  const workspaces: Workspace[] = [];

  beforeAll(async () => {
    project = await createProject({ locales: ["de"] });
  });

  afterEach(async () => {
    await Promise.all(workspaces.splice(0).map((workspace) => workspace.cleanup()));
  });

  const workspace = async () => {
    const created = await createWorkspace({ translationsPath: "./src/locales" });
    workspaces.push(created);
    return created;
  };

  it("pushes local files, pulls them back and generates types from the same keys", async () => {
    const source = await workspace();
    await source.write("src/locales/en.json", {
      greeting: "Hello, {name}!",
      nav: { home: "Home" },
    });
    await source.write("src/locales/de.json", { greeting: "Hallo, {name}!" });
    await source.write("src/locales/admin/en.json", { title: "Admin" });

    const push = await runCli(["push", "--force-mode", "override"], {
      cwd: source.dir,
      apiKey: project.keys.full,
    });
    expect(push.code, push.stdout + push.stderr).toBe(0);

    const remote = await fetchRemote(project.keys.full);
    expect(remote.admin?.en).toEqual({ title: "Admin" });

    const target = await workspace();
    const pull = await runCli(["pull"], { cwd: target.dir, apiKey: project.keys.full });
    expect(pull.code, pull.stdout + pull.stderr).toBe(0);
    expect(await target.readJson("src/locales/en.json")).toEqual({
      greeting: "Hello, {name}!",
      "nav.home": "Home",
    });
    expect(await target.readJson("src/locales/de.json")).toEqual({ greeting: "Hallo, {name}!" });
    expect(await target.readJson("src/locales/admin/en.json")).toEqual({ title: "Admin" });

    // Types from the platform need its schema v2 route (scripts/cli-e2e.mjs warns without it).
    // Without it the pull still succeeds, says why the schema is missing and writes none.
    if (!SCHEMA_V2) {
      expect(pull.stderr).toContain(".comvi/schema.json not written:");
      expect(pull.stderr).toContain("predates the typegen schema v2 route");
      await expect(access(join(target.dir, ".comvi/schema.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      return;
    }
    const typegen = await runCli(["typegen"], { cwd: target.dir, apiKey: project.keys.full });
    expect(typegen.code, typegen.stdout + typegen.stderr).toBe(0);
    const declarations = await target.read("src/types/i18n.d.ts");
    expect(declarations).toContain('"greeting": { "name": string | number };');
    expect(declarations).toContain('    "admin": {\n      "title": never;\n    };');
    // The pull wrote the same schema: offline generation from it gives the same bytes.
    const offline = await runCli(["typegen", "--from", ".comvi/schema.json", "--check"], {
      cwd: target.dir,
    });
    expect(offline.code, offline.stdout + offline.stderr).toBe(0);

    const check = await runCli(["typegen", "--check"], {
      cwd: target.dir,
      apiKey: project.keys.full,
    });
    expect(check.code, check.stdout + check.stderr).toBe(0);
  });
});
