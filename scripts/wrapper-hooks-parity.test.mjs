// Wrapper parity: the four framework bindings expose the SAME `useI18n()` members (design §3.4,
// R3-5). Each binding's `UseI18n` interface is read FROM ITS SOURCE and its member NAMES compared
// to one list; `tests/binding-parity` holds the types behind those names. The 0.7 checks of this
// file (`UseI18nReturn` and its allow-list) left with the last 0.7 binding in lot 5.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readSource = (relativePath) => fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");

/**
 * The body of `export interface <name>` — comments stripped first, so a brace
 * in prose cannot unbalance the walk.
 */
export function extractInterfaceBody(source, name, relativePath) {
  const stripped = stripComments(source);
  const match = new RegExp(`export interface ${name}\\b`).exec(stripped);
  assert.ok(match, `${relativePath}: no "export interface ${name}"`);

  // Skip the type-parameter list: a default such as `D = {}` carries the very
  // brace a naive "first `{`" search would open the body on.
  let i = match.index + match[0].length;
  while (/\s/.test(stripped[i])) i++;
  if (stripped[i] === "<") {
    let angle = 0;
    do {
      if (stripped[i] === "<") angle++;
      else if (stripped[i] === ">") angle--;
      i++;
    } while (i < stripped.length && angle > 0);
  }
  const open = stripped.indexOf("{", i);
  assert.notEqual(open, -1, `${relativePath}: interface ${name} has no body`);

  const start = open + 1;
  let depth = 1;
  i = start;
  for (; i < stripped.length && depth > 0; i++) {
    if (stripped[i] === "{") depth++;
    else if (stripped[i] === "}") depth--;
  }
  assert.equal(depth, 0, `${relativePath}: interface ${name} never closes`);
  return stripped.slice(start, i - 1);
}

/**
 * Split an interface body into its members: one chunk per `;` at brace and
 * paren depth zero, so a nested object type or a multi-line signature stays
 * one member. Returns `{ name, type }` per member.
 */
export function parseInterfaceMembers(body) {
  const members = [];
  let depth = 0;
  let chunk = "";
  for (const ch of body) {
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth--;
    if (ch === ";" && depth === 0) {
      members.push(chunk);
      chunk = "";
      continue;
    }
    chunk += ch;
  }
  if (chunk.trim()) members.push(chunk);

  return members
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const name = /^(\w+)\s*(\??)\s*[:(<]/.exec(text);
      assert.ok(name, `unparseable interface member: ${JSON.stringify(text)}`);
      const colon = text.indexOf(":", name[1].length);
      const type = colon === -1 ? "" : text.slice(colon + 1).trim();
      return { name: name[1], type, optional: name[2] === "?" };
    });
}

/** Where each 0.8 binding declares what `useI18n()` returns (design §3.4). */
const ON_08_USE_I18N = {
  "@comvi/react": ["packages/react/src/binding.ts", "UseI18n"],
  "@comvi/vue": ["packages/vue/src/binding.ts", "UseI18n"],
  "@comvi/solid": ["packages/solid/src/binding.ts", "UseI18n"],
  "@comvi/svelte": ["packages/svelte/src/binding.ts", "UseI18n"],
};
/**
 * Design §3.4's six members, the bound `T` of R3-5(b) and `isReady` of lot 4c (R3-26), sorted:
 * "T" before lowercase.
 */
const ON_08_MEMBERS = ["T", "dir", "i18n", "isLoading", "isReady", "locale", "setLocale", "t"];

test("every binding returns exactly design §3.4's useI18n() members", () => {
  assert.deepEqual(Object.keys(ON_08_USE_I18N).sort(), [
    "@comvi/react",
    "@comvi/solid",
    "@comvi/svelte",
    "@comvi/vue",
  ]);
  for (const [pkg, where] of Object.entries(ON_08_USE_I18N)) {
    const names = parseInterfaceMembers(
      extractInterfaceBody(readSource(where[0]), where[1], where[0]),
    ).map((m) => m.name);
    assert.deepEqual(names.sort(), ON_08_MEMBERS, `${pkg}: useI18n() members`);
  }
});

/**
 * Drop comments so a prose mention of a pattern cannot masquerade as code: a
 * provider whose comment still DISCUSSES `type AnyI18nInstance =` must not read as
 * one that declares it, and a brace in prose must not unbalance the interface
 * walk above.
 */
function stripComments(block) {
  return block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

test("stripComments removes a commented mention so it cannot pass for code", () => {
  assert.equal(stripComments("// String(x)\nconst a = 1;\n").includes("String("), false);
  assert.equal(stripComments("/* String(x) */\nconst a = 1;\n").includes("String("), false);
  assert.equal(stripComments("const a = String(1);\n").includes("String("), true);
});

test("extractInterfaceBody + parseInterfaceMembers read names and multi-line signatures", () => {
  const source = [
    "export interface UseI18nReturn<D = {}> {",
    "  /** a { brace in prose */",
    "  t: TranslateFn<D, string>;",
    "  // locale?: string",
    "  hasTranslation: (key: string, opts?: { locale?: string; ns?: string }) => boolean;",
    "  formatNumber: (",
    "    value: number,",
    "    locale?: string,",
    "  ) => string;",
    "  on: <E extends I18nEvent>(event: E, cb: (p: I18nEventData[E]) => void) => () => void;",
    "  isLoading?: boolean;",
    "}",
    "export interface Other { x: number; }",
  ].join("\n");

  const members = parseInterfaceMembers(extractInterfaceBody(source, "UseI18nReturn", "f.ts"));
  assert.deepEqual(
    members.map((m) => m.name),
    ["t", "hasTranslation", "formatNumber", "on", "isLoading"],
  );
  assert.equal(members[2].type.includes("locale?: string"), true);
  assert.throws(
    () => extractInterfaceBody(source, "Missing", "f.ts"),
    /no "export interface Missing"/,
  );
});
