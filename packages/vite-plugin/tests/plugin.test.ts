/**
 * The plugin over a real Vite (`build()` and a dev server in middleware mode) and real
 * files: it writes what the typegen Node API writes, generates once per build and fails it
 * on an error, and in dev follows the catalogs until the server closes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build, createServer, type ViteDevServer } from "vite";
import { generate, serializeWireSchema, LocalSource } from "@comvi/typegen";
import { comviTypes, type ComviTypesOptions } from "../src";

const roots: string[] = [];
const servers: ViteDevServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const CATALOGS: Record<string, unknown> = {
  "en.json": { hello: "Hi {name}", terms: "Read the <link>terms</link>", title: "Title" },
  "de.json": { hello: "Hallo {name}", terms: "Lies die <link>AGB</link>", title: "Titel" },
  "shop/en.json": { "cart.items": "{count, plural, one {# item} other {# items}}" },
};

/** A Vite app: package.json declaring @comvi/react, an entry, catalogs under src/locales. */
function app(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "comvi-vite-plugin-")));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", dependencies: { "@comvi/react": "^0.8.0" } }),
  );
  fs.writeFileSync(path.join(root, "main.js"), "export const x = 1;\n");
  for (const [rel, catalog] of Object.entries(CATALOGS)) write(root, rel, catalog);
  return root;
}

function write(root: string, rel: string, content: unknown): void {
  const file = path.join(root, "src/locales", rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

const OUT = "src/types/i18n.d.ts";
const read = (root: string) => fs.readFileSync(path.join(root, OUT), "utf8");
const PLUGIN: ComviTypesOptions = { from: "./src/locales", sourceLocale: "en" };

async function viteBuild(root: string, options: ComviTypesOptions = PLUGIN): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [comviTypes(options)],
    build: { write: false, lib: { entry: "main.js", formats: ["es"], fileName: "main" } },
  });
}

async function devServer(root: string, options: ComviTypesOptions = PLUGIN) {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [comviTypes(options)],
    server: { middlewareMode: true, ws: false, watch: null },
  });
  servers.push(server);
  return server;
}

describe("vite build", () => {
  it("writes exactly the bytes generate() writes for the same catalogs", async () => {
    const root = app();
    await viteBuild(root);

    const api = await generate({
      from: "src/locales",
      out: "api.d.ts",
      root,
      sourceLocale: "en",
      onMessage: () => {},
    });
    expect(read(root)).toBe(api.content);
    expect(api.content).toContain("declare module '@comvi/react'");
    expect(api.content).toContain('"terms": { "link": Tag };');
  });

  it("reads a wire schema file and writes the same bytes as from the directory", async () => {
    const root = app();
    const source = new LocalSource({ dir: path.join(root, "src/locales"), sourceLocale: "en" });
    source.refresh();
    fs.mkdirSync(path.join(root, ".comvi"));
    fs.writeFileSync(
      path.join(root, ".comvi/schema.json"),
      serializeWireSchema(source.schema().schema),
    );
    await viteBuild(root, { from: ".comvi/schema.json", out: "from-schema.d.ts" });
    await viteBuild(root);

    expect(fs.readFileSync(path.join(root, "from-schema.d.ts"), "utf8")).toBe(read(root));
  });

  it("honours out, defaultParams and augment", async () => {
    const root = app();
    await viteBuild(root, {
      ...PLUGIN,
      out: "comvi.d.ts",
      defaultParams: ["name"],
      augment: "@acme/i18n",
    });

    const written = fs.readFileSync(path.join(root, "comvi.d.ts"), "utf8");
    expect(written).toContain("declare module '@acme/i18n'");
    expect(written).toContain('"hello": { "name"?: string | number };');
  });

  it("fails the build on broken JSON, names the file, and keeps the old declaration", async () => {
    const root = app();
    await viteBuild(root);
    const before = read(root);
    write(root, "shop/en.json", '{ "cart.items": ');

    await expect(viteBuild(root)).rejects.toThrow(
      /\[@comvi\/vite-plugin\] Cannot generate src\/types\/i18n\.d\.ts: .*shop\/en\.json: invalid JSON/,
    );
    expect(read(root)).toBe(before);
  });

  it("does not rewrite an unchanged declaration (same inode, same mtime)", async () => {
    const root = app();
    await viteBuild(root);
    const before = fs.statSync(path.join(root, OUT));
    await viteBuild(root);
    const after = fs.statSync(path.join(root, OUT));
    expect([after.ino, after.mtimeMs]).toEqual([before.ino, before.mtimeMs]);
  });

  it("refuses a missing `from` when the config is read, naming the option", () => {
    expect(() => comviTypes({} as ComviTypesOptions)).toThrow(
      "[@comvi/vite-plugin] `from` must name the catalogs directory",
    );
  });
});

// File-system events can lag under load: generous waits, no timing asserted.
describe("vite dev", { timeout: 60_000 }, () => {
  const until = (check: () => void) => vi.waitFor(check, { timeout: 15_000, interval: 25 });

  it("generates on start, follows a new key, and stops when the server closes", async () => {
    const root = app();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const server = await devServer(root);
    await until(() => expect(read(root)).toContain('"title": never;'));

    write(root, "en.json", { ...(CATALOGS["en.json"] as object), added: "{fresh}" });
    await until(() => expect(read(root)).toContain('"added": { "fresh": string | number };'));
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^\[@comvi\/vite-plugin\] wrote /));

    await server.close();
    servers.splice(servers.indexOf(server), 1);
    write(root, "en.json", { ...(CATALOGS["en.json"] as object), late: "x" });
    // Closed: nothing follows the catalogs any more. A second server shows the change is
    // real (it writes it), so the absence above is the closed watcher, not a lost event.
    await new Promise((r) => setTimeout(r, 400));
    expect(read(root)).not.toContain('"late"');
    await devServer(root);
    await until(() => expect(read(root)).toContain('"late": never;'));
  });

  it("broken JSON in dev: one error, the file stays, the server keeps running", async () => {
    const root = app();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await devServer(root);
    await until(() => expect(read(root)).toContain('"title": never;'));
    const before = read(root);

    write(root, "de.json", "{ broken");
    await until(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error.mock.calls[0][0]).toMatch(
      /^\[@comvi\/vite-plugin\] .*de\.json: invalid JSON .*src\/types\/i18n\.d\.ts is kept as it was$/,
    );
    expect(read(root)).toBe(before);

    write(root, "de.json", { hello: "Hallo {name}", fixed: "x" });
    await until(() => expect(read(root)).toContain('"fixed": never;'));
  });

  it("two dev servers of one app: one writes, the other waits", async () => {
    const root = app();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await devServer(root);
    await until(() => expect(read(root)).toContain('"title": never;'));
    await devServer(root);
    await until(() =>
      expect(info).toHaveBeenCalledWith(
        "[@comvi/vite-plugin] src/types/i18n.d.ts is already generated by another watcher; this one takes over when it stops",
      ),
    );

    write(root, "en.json", { ...(CATALOGS["en.json"] as object), one: "x" });
    await until(() => expect(read(root)).toContain('"one": never;'));
    await new Promise((r) => setTimeout(r, 400));
    const wrote = info.mock.calls.filter(([line]) => String(line).includes("] wrote "));
    // The first generation and the change: two writes, by one server.
    expect(wrote).toHaveLength(2);
  });
});
