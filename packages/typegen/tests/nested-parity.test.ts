/**
 * Nested catalogs (lot 6a, D1): typegen reads a catalog by the core's own rule
 * (`packages/core/src/flat.ts`), so the types name exactly the keys the runtime reads. The cases
 * are the core's (`packages/core/tests/fixtures/nested/cases.json`); @comvi/cli tests the same.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generate, LocalSource } from "../src";

type Case = { name: string; input: object; flat: Record<string, string>; left: [string, number][] };
const { cases } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../core/tests/fixtures/nested/cases.json"), "utf8"),
) as { cases: Case[] };

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const dir = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-typegen-nested-"));
  dirs.push(root);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: { "@comvi/react": "^0.8.0" } }),
  );
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, "locales", rel)), { recursive: true });
    fs.writeFileSync(path.join(root, "locales", rel), text);
  }
  return root;
};

describe("typegen sees the keys the core sees", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    // The file's own text: a `__proto__` key stays a key.
    const root = dir({ "en.json": JSON.stringify(c.input) });
    const source = new LocalSource({ dir: path.join(root, "locales"), sourceLocale: "en" });
    source.refresh();
    const { schema, warnings } = source.schema();
    expect(Object.keys(schema.namespaces.default ?? {}).sort()).toEqual(Object.keys(c.flat).sort());
    expect(warnings.map((w) => w.key)).toEqual(c.left.map(([k]) => k));
  });

  it("after a JSON change the types follow: a new nested key appears", async () => {
    const root = dir({ "en.json": JSON.stringify({ account: { greeting: "Hi {name}" } }) });
    const first = await generate({ from: "locales", out: "comvi.d.ts", root, onMessage: () => {} });
    expect(first.content).toContain('"account.greeting": { "name": string | number };');
    expect(first.content).not.toContain("account.items");
    fs.writeFileSync(
      path.join(root, "locales/en.json"),
      JSON.stringify({
        account: { greeting: "Hi {name}", items: "{count, plural, one {# item} other {# items}}" },
      }),
    );
    const second = await generate({
      from: "locales",
      out: "comvi.d.ts",
      root,
      onMessage: () => {},
    });
    expect(second.content).toContain('"account.items": { "count": number };');
  });
});
