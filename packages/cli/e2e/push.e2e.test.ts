import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createProject,
  createWorkspace,
  fetchRemote,
  runCli,
  type E2EProject,
  type KeyName,
  type Workspace,
} from "./harness";

let project: E2EProject;
const workspaces: Workspace[] = [];
let namespaceCounter = 0;

beforeAll(async () => {
  // The restricted fixture user may write en and es only.
  project = await createProject({ locales: ["de", "es", "pt-BR"] });
});

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => workspace.cleanup()));
});

/** A workspace whose files land in a namespace no other test touches. */
async function workspace(): Promise<{ ws: Workspace; ns: string }> {
  const ws = await createWorkspace({ translationsPath: "./src/locales" });
  workspaces.push(ws);
  return { ws, ns: `push${++namespaceCounter}` };
}

function push(ws: Workspace, args: string[], key: KeyName = "full") {
  return runCli(["push", ...args], { cwd: ws.dir, apiKey: project.keys[key] });
}

/** The namespace's values per locale; the API lists every project locale, empty ones too. */
async function remote(ns: string) {
  const locales = (await fetchRemote(project.keys.full))[ns] ?? {};
  return Object.fromEntries(
    Object.entries(locales).filter(([, values]) => Object.keys(values).length > 0),
  );
}

describe("comvi push", () => {
  it("reports what it created, changed and left alone", async () => {
    const { ws, ns } = await workspace();
    await ws.write(`src/locales/${ns}/en.json`, { a: "A", b: "B" });
    await ws.write(`src/locales/${ns}/de.json`, { a: "A de" });

    const first = await push(ws, ["--force-mode", "override"]);
    expect(first.code, first.stdout + first.stderr).toBe(0);
    expect(first.stdout).toContain("Keys created: 2");
    expect(first.stdout).toContain("Values: 3 new, 0 changed, 0 kept on the platform");

    await ws.write(`src/locales/${ns}/en.json`, { a: "A2", b: "B" });
    const second = await push(ws, ["--force-mode", "override"]);
    expect(second.code, second.stdout + second.stderr).toBe(0);
    expect(second.stdout).toContain("Keys created: 0");
    expect(second.stdout).toContain("Values: 0 new, 1 changed, 0 kept on the platform");

    expect(await remote(ns)).toEqual({ en: { a: "A2", b: "B" }, de: { a: "A de" } });
  });

  it("keeps the platform's value in keep mode and says so", async () => {
    const { ws, ns } = await workspace();
    await ws.write(`src/locales/${ns}/en.json`, { a: "Server" });
    expect((await push(ws, ["--force-mode", "override"])).code).toBe(0);

    await ws.write(`src/locales/${ns}/en.json`, { a: "Local", n: "New" });
    const result = await push(ws, ["--force-mode", "keep"]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("Values: 1 new, 0 changed, 1 kept on the platform");
    expect((await remote(ns)).en).toEqual({ a: "Server", n: "New" });
  });

  it("exits 1 and writes nothing in abort mode when a value conflicts", async () => {
    const { ws, ns } = await workspace();
    await ws.write(`src/locales/${ns}/en.json`, { a: "Server" });
    expect((await push(ws, ["--force-mode", "override"])).code).toBe(0);

    await ws.write(`src/locales/${ns}/en.json`, { a: "Local", n: "New" });
    const result = await push(ws, ["--force-mode", "abort"]);

    expect(result.code, result.stdout + result.stderr).toBe(1);
    expect((await remote(ns)).en).toEqual({ a: "Server" });
  });

  describe("in ask mode without a terminal", () => {
    it("commits when nothing conflicts", async () => {
      const { ws, ns } = await workspace();
      await ws.write(`src/locales/${ns}/en.json`, { a: "A" });

      const result = await push(ws, []);

      expect(result.code, result.stdout + result.stderr).toBe(0);
      expect((await remote(ns)).en).toEqual({ a: "A" });
    });

    it("exits 4 with a hint when a value conflicts", async () => {
      const { ws, ns } = await workspace();
      await ws.write(`src/locales/${ns}/en.json`, { a: "Server" });
      expect((await push(ws, ["--force-mode", "override"])).code).toBe(0);
      await ws.write(`src/locales/${ns}/en.json`, { a: "Local" });

      const result = await push(ws, []);

      expect(result.code, result.stdout + result.stderr).toBe(4);
      expect(result.stderr).toContain("--force-mode override, keep, or abort");
      expect((await remote(ns)).en).toEqual({ a: "Server" });
    });
  });

  it("writes files named in another spelling of a project locale to that locale", async () => {
    const { ws, ns } = await workspace();
    await ws.write(`src/locales/${ns}/ES.json`, { a: "es" });
    await ws.write(`src/locales/${ns}/pt-br.json`, { a: "pt" });

    const result = await push(ws, ["--force-mode", "override"]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(await remote(ns)).toEqual({ es: { a: "es" }, "pt-BR": { a: "pt" } });
  });

  describe("a local locale the project does not have", () => {
    it("fails the push with exit 4 and names it", async () => {
      const { ws, ns } = await workspace();
      await ws.write(`src/locales/${ns}/en.json`, { a: "A" });
      await ws.write(`src/locales/${ns}/fr.json`, { a: "A fr" });

      const result = await push(ws, ["--force-mode", "override"]);

      expect(result.code, result.stdout + result.stderr).toBe(4);
      expect(result.stderr).toContain("fr");
      expect(result.stderr).toContain("--skip-unknown-locales");
      expect(await remote(ns)).toEqual({});
    });

    it("is left out with --skip-unknown-locales", async () => {
      const { ws, ns } = await workspace();
      await ws.write(`src/locales/${ns}/en.json`, { a: "A" });
      await ws.write(`src/locales/${ns}/fr.json`, { a: "A fr" });

      const result = await push(ws, ["--force-mode", "override", "--skip-unknown-locales"]);

      expect(result.code, result.stdout + result.stderr).toBe(0);
      expect(result.stderr).toContain("Skipping locales the project does not have: fr");
      expect(await remote(ns)).toEqual({ en: { a: "A" } });
    });
  });

  it("treats a locale a language-restricted key may not write as unknown", async () => {
    const { ws, ns } = await workspace();
    await ws.write(`src/locales/${ns}/en.json`, { a: "A" });
    await ws.write(`src/locales/${ns}/de.json`, { a: "A de" });

    const strict = await push(ws, ["--force-mode", "override"], "restricted");
    expect(strict.code, strict.stdout + strict.stderr).toBe(4);
    expect(strict.stderr).toContain("may not write: de");
    expect(await remote(ns)).toEqual({});

    const rest = await push(
      ws,
      ["--force-mode", "override", "--skip-unknown-locales"],
      "restricted",
    );
    expect(rest.code, rest.stdout + rest.stderr).toBe(0);
    expect(await remote(ns)).toEqual({ en: { a: "A" } });
  });

  it("exits 3 and names the missing scope for a read-only key", async () => {
    const { ws, ns } = await workspace();
    await ws.write(`src/locales/${ns}/en.json`, { a: "A" });

    const result = await push(ws, ["--force-mode", "override"], "read");

    expect(result.code, result.stdout + result.stderr).toBe(3);
    expect(result.stderr).toContain("translations:write");
    expect(await remote(ns)).toEqual({});
  });

  it("exits 4 when there is nothing to push, unless --allow-empty", async () => {
    const { ws } = await workspace();
    await ws.write("src/locales/en.json", {});

    const strict = await push(ws, ["--force-mode", "override"]);
    expect(strict.code, strict.stdout + strict.stderr).toBe(4);
    expect(strict.stderr).toContain("--allow-empty");

    const allowed = await push(ws, ["--force-mode", "override", "--allow-empty"]);
    expect(allowed.code, allowed.stdout + allowed.stderr).toBe(0);
  });

  // Postgres caps a statement at 65,535 bind parameters: an unchunked commit
  // failed from about 1,200 new keys.
  it("lands a first push of 5,000 keys in two locales", async () => {
    const { ws, ns } = await workspace();
    const catalog = (suffix: string) =>
      Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, `Value ${i} ${suffix}`]));
    await ws.write(`src/locales/${ns}/en.json`, catalog("en"));
    await ws.write(`src/locales/${ns}/de.json`, catalog("de"));

    const result = await push(ws, ["--force-mode", "override", "--ns", ns]);

    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("Keys created: 5000");
    const pushed = await remote(ns);
    expect(Object.keys(pushed.en ?? {})).toHaveLength(5000);
    expect(Object.keys(pushed.de ?? {})).toHaveLength(5000);
    expect(pushed.de?.k4999).toBe("Value 4999 de");
  });
});
