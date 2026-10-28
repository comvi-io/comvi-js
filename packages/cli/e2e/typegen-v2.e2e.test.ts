/**
 * Typegen v2 against a REAL platform (R3-18 "correct": one output from every input): the
 * same catalogs, pushed to the platform and read back through `GET /schema/v2`, and read
 * from the local directory, give the same `comvi.d.ts` byte for byte; `watch()` on the
 * platform follows a change through the v1 SSE stream.
 *
 *   PLATFORM_DIR=<platform checkout with schema v2> node scripts/cli-e2e.mjs typegen-v2
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generate, serializeWireSchema, LocalSource, watch } from "@comvi/typegen";
import {
  API_URL,
  createProject,
  createWorkspace,
  runCli,
  type E2EProject,
  type Workspace,
} from "./harness";

/** Every message form the reader has an opinion about that core renders. */
const CATALOGS: Record<string, Record<string, string>> = {
  "en.json": {
    greeting: "Hi {name}!",
    items: "{count, plural, =0 {none} one {# item} other {# items}}",
    rank: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    gender: "{g, select, male {He} female {She} other {They}}",
    nested:
      "{count, plural, one {{gender, select, male {He has one} other {They have one}}} other {# items for {who}}}",
    terms: "Accept the <link>terms</link> and <b>{policy}</b>.",
    repeated: "{n, plural, one {a} one {{hidden}} other {b}}",
    quoted: "It''s '{literal}' and {real}",
    title: "Title",
  },
  "de.json": {
    greeting: "Hallo {name}!",
    gender: "{g, select, male {Er} female {Sie} divers {Sie} other {Sie}} {extra}",
    deOnly: "{count, plural, other {# Stück}} <em>x</em>",
  },
  "shop/en.json": { "cart.title": "{count, plural, one {Cart (#)} other {Cart (#)}}" },
  "shop/de.json": { "cart.title": "{count, plural, one {Korb (#)} other {Korb (#)}}" },
};

let project: E2EProject;
let ws: Workspace;

beforeAll(async () => {
  project = await createProject({ locales: ["de"] });
  ws = await createWorkspace({ translationsPath: "./src/locales" });
  for (const [file, catalog] of Object.entries(CATALOGS))
    await ws.write(`src/locales/${file}`, catalog);
  const pushed = await runCli(["push", "--force-mode", "override"], {
    cwd: ws.dir,
    apiKey: project.keys.full,
  });
  expect(pushed.code, pushed.stdout + pushed.stderr).toBe(0);
});

afterAll(async () => {
  await ws?.cleanup();
});

describe("typegen v2 against the platform", () => {
  it("writes the same comvi.d.ts from the platform route as from the local directory", async () => {
    const local = await generate({
      from: "src/locales",
      out: "local.d.ts",
      root: ws.dir,
      sourceLocale: "en",
      onMessage: () => {},
    });
    const remote = await generate({
      from: { platform: { apiKey: project.keys.full, apiBaseUrl: API_URL } },
      out: "platform.d.ts",
      root: ws.dir,
    });
    expect(remote.content).toBe(local.content);
    expect(await ws.read("platform.d.ts")).toBe(await ws.read("local.d.ts"));
    // And the wire schema itself, canonically serialized.
    const response = await fetch(`${API_URL}/v1/projects/${project.id}/schema/v2`, {
      headers: { authorization: `Bearer ${project.keys.full}` },
    });
    const source = new LocalSource({ dir: `${ws.dir}/src/locales`, sourceLocale: "en" });
    source.refresh();
    const { parseWireSchema } = await import("@comvi/typegen");
    expect(serializeWireSchema(parseWireSchema(await response.json()))).toBe(
      serializeWireSchema(source.schema().schema),
    );
  });

  it("watch() regenerates when the platform's catalogs change (v1 stream as the signal)", async () => {
    const w = watch({
      from: { platform: { apiKey: project.keys.full, apiBaseUrl: API_URL } },
      out: "watched.d.ts",
      root: ws.dir,
      debounceMs: 100,
      onMessage: () => {},
    });
    try {
      await w.ready;
      await w.idle();
      expect(await ws.read("watched.d.ts")).not.toContain('"added"');
      await ws.write("src/locales/en.json", { ...CATALOGS["en.json"], added: "{fresh}" });
      const pushed = await runCli(["push", "--force-mode", "override"], {
        cwd: ws.dir,
        apiKey: project.keys.full,
      });
      expect(pushed.code, pushed.stdout + pushed.stderr).toBe(0);
      await vi.waitFor(
        async () =>
          expect(await ws.read("watched.d.ts")).toContain('"added": { "fresh": string | number };'),
        { timeout: 30_000, interval: 200 },
      );
    } finally {
      w.close();
    }
  });
});
