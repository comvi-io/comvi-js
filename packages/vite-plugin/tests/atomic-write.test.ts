import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { comviTypes } from "../src";

// A fixed UUID makes the temp path deterministic, so a test can occupy the
// exact path the plugin is about to claim.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: () => "00000000-0000-4000-8000-000000000000" };
});

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("declaration writes", () => {
  it("never reuses an occupied temp path, so existing declarations stay intact", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "comvi-vite-atomic-"));
    roots.push(root);
    await fs.mkdir(path.join(root, "locales"));
    await fs.writeFile(path.join(root, "locales", "en.json"), '{ "greeting": "Hi" }');
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { "@comvi/react": "^0.5.0" } }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const plugin: Plugin = comviTypes({ translations: "./locales", output: "./i18n.d.ts" });
    (plugin.configResolved as (config: ResolvedConfig) => void)({
      root,
      command: "build",
    } as ResolvedConfig);
    const buildStart = plugin.buildStart as () => Promise<void>;
    const output = path.join(root, "i18n.d.ts");

    await buildStart();
    const before = await fs.readFile(output, "utf-8");

    await fs.writeFile(path.join(root, "locales", "en.json"), '{ "greeting": "Hi", "bye": "Bye" }');
    const tempPath = `${output}.${process.pid}.00000000-0000-4000-8000-000000000000.tmp`;
    await fs.writeFile(tempPath, "unrelated data");

    await expect(buildStart()).rejects.toThrow(/EEXIST/);
    expect(await fs.readFile(output, "utf-8")).toBe(before);
  });
});
