// Wrapper parity — the four framework bindings expose the SAME `useI18n()`.
//
// B8's half of this gate is GONE, and so is what it pinned: the
// loader/plugin-host acquisition each wrapper used to own a byte-identical copy
// of now lives once in `@comvi/core` as `acquireLoaderApi(host)` /
// `acquirePluginsApi(host)` on `@comvi/core/loader` / `@comvi/core/plugins`.
// Each `useI18nLoader()` / `useI18nPlugins()` is a one-line call over the host
// in context, so there is no text region left to diff and no copy left to
// drift. What that half proved — the acquirers exist once, throw
// `missingCapability(...)`, type `onMissingKey` with core's own type and never
// coerce the callback result — is asserted in `@comvi/core`'s own suite
// (`tests/features/capability-acquisition.test.ts`, `tests/types/subpaths.test-d.ts`),
// plus one `Equal<…>` per binding tying its hook's return to the acquirer's.
//
// P1 (wave 3) — this file diffs the four `UseI18nReturn` interfaces.
// Comparing one copied region is exactly why `isInitialized`, `cacheRevision`
// and the formatters' `locale` override drifted out of two bindings unseen:
// the region never contained them. The member-set tests below read each
// binding's `UseI18nReturn` FROM ITS SOURCE and diff the NAME SETS against ONE
// allow-list of justified differences, each with a reason. A name present in
// fewer than four bindings and absent from the list fails the release; so does
// a listed difference that no longer exists.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where each binding declares the `UseI18nReturn` interface `useI18n()` returns. */
const USE_I18N_RETURN = {
  "@comvi/react": "packages/react/src/useI18n.ts",
  "@comvi/vue": "packages/vue/src/composables/useI18n.ts",
  "@comvi/solid": "packages/solid/src/useI18n.ts",
  "@comvi/svelte": "packages/svelte/src/useI18n.ts",
};

/**
 * A member typed as an indexed access into a class (`VueI18n["formatNumber"]`)
 * is resolved against that class's `declare member: …;` line here, so the
 * arity check still reads the real signature.
 */
const DECLARATION_SOURCES = {
  VueI18n: "packages/vue/src/VueI18n.ts",
};

/**
 * THE allow-list. Every `UseI18nReturn` member name that is not on all four
 * bindings must appear here with the exact binding set that has it and a
 * one-line reason; anything else is drift. An entry whose difference has
 * closed (the name reached all four) is stale and fails too.
 */
const ALLOWED_MEMBER_DIFFERENCES = {
  messagesCache: {
    only: ["@comvi/react", "@comvi/vue"],
    reason:
      "react/vue hand out the cache snapshot as a value; solid/svelte as `getMessagesCache()`",
  },
  getMessagesCache: {
    only: ["@comvi/solid", "@comvi/svelte"],
    reason: "the accessor half of the `messagesCache` value/function split above",
  },
  loadedLocales: {
    only: ["@comvi/vue"],
    reason:
      "vue exposes the reactive `ComputedRef` under the noun; the other three expose the host getter",
  },
  getLoadedLocales: {
    only: ["@comvi/react", "@comvi/solid", "@comvi/svelte"],
    reason: "the getter half of vue's `loadedLocales` ComputedRef",
  },
  activeNamespaces: {
    only: ["@comvi/vue"],
    reason:
      "vue exposes the reactive `ComputedRef` under the noun; the other three expose the host getter",
  },
  getActiveNamespaces: {
    only: ["@comvi/react", "@comvi/solid", "@comvi/svelte"],
    reason: "the getter half of vue's `activeNamespaces` ComputedRef",
  },
  defaultNamespace: {
    only: ["@comvi/vue"],
    reason:
      "vue exposes the reactive `ComputedRef` under the noun; the other three expose the host getter",
  },
  getDefaultNamespace: {
    only: ["@comvi/react", "@comvi/solid", "@comvi/svelte"],
    reason: "the getter half of vue's `defaultNamespace` ComputedRef",
  },
  destroy: {
    only: ["@comvi/vue"],
    reason:
      "`VueI18n` owns reactive subscriptions it must dispose; the other three have no wrapper object",
  },
};

/** The formatters every binding's `useI18n()` returns, each with a trailing `locale?` override. */
const FORMATTERS = ["formatNumber", "formatDate", "formatCurrency", "formatRelativeTime"];

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

/** `useI18n()`'s members per binding, as each `UseI18nReturn` declares them. */
const USE_I18N_MEMBERS = Object.fromEntries(
  Object.entries(USE_I18N_RETURN).map(([pkg, relativePath]) => [
    pkg,
    parseInterfaceMembers(
      extractInterfaceBody(readSource(relativePath), "UseI18nReturn", relativePath),
    ),
  ]),
);

/**
 * The signature text behind a member type. An indexed access into a listed
 * class (`VueI18n["formatNumber"]`) is followed to that class's `declare` line.
 */
export function resolveMemberType(type) {
  const indexed = /^(\w+)\["(\w+)"\]$/.exec(type);
  if (!indexed) return type;
  const [, owner, member] = indexed;
  const relativePath = DECLARATION_SOURCES[owner];
  assert.ok(relativePath, `no declaration source registered for ${owner}`);
  const declared = new RegExp(`declare ${member}:\\s*([^;]*);`).exec(
    stripComments(readSource(relativePath)),
  );
  assert.ok(declared, `${relativePath}: no "declare ${member}: …;"`);
  return declared[1].trim();
}

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

// ---------------------------------------------------------------------------
// P1 — `useI18n()` returns the same member NAME SET in all four bindings, bar
// the allow-list. Solid and svelte carried `isInitialized` / `cacheRevision`
// for a release while react and vue did not, and nothing noticed.
// ---------------------------------------------------------------------------

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

test("resolveMemberType follows an indexed access into a registered class", () => {
  assert.equal(resolveMemberType("(value: number) => string"), "(value: number) => string");
  assert.match(resolveMemberType('VueI18n["formatNumber"]'), /locale\?: string/);
  assert.throws(() => resolveMemberType('Nope["formatNumber"]'), /no declaration source/);
});

test("every UseI18nReturn parses to a non-trivial member set", () => {
  for (const [pkg, members] of Object.entries(USE_I18N_MEMBERS)) {
    assert.ok(members.length >= 20, `${pkg}: only ${members.length} members parsed`);
    assert.ok(
      members.some((m) => m.name === "t"),
      `${pkg}: no "t" member`,
    );
  }
});

test("useI18n() member names match across all four bindings, bar the allow-list", () => {
  const packages = Object.keys(USE_I18N_MEMBERS).sort();
  const names = new Set(
    Object.values(USE_I18N_MEMBERS).flatMap((members) => members.map((m) => m.name)),
  );

  const drift = [];
  for (const name of [...names].sort()) {
    const present = packages.filter((pkg) => USE_I18N_MEMBERS[pkg].some((m) => m.name === name));
    if (present.length === packages.length) continue;
    const allowed = ALLOWED_MEMBER_DIFFERENCES[name];
    const missing = packages.filter((pkg) => !present.includes(pkg));
    if (!allowed) {
      drift.push(`${name}: missing from ${missing.join(", ")} (not on the allow-list)`);
    } else if (allowed.only.slice().sort().join() !== present.join()) {
      drift.push(
        `${name}: allow-list says only [${allowed.only.join(", ")}], source has [${present.join(", ")}]`,
      );
    }
  }

  assert.deepEqual(
    drift,
    [],
    "UseI18nReturn member drift. Add the member to the binding that lacks it, or justify it in ALLOWED_MEMBER_DIFFERENCES.",
  );
});

test("the allow-list only names real, still-open differences with a reason", () => {
  const packages = Object.keys(USE_I18N_MEMBERS);
  const stale = [];
  for (const [name, entry] of Object.entries(ALLOWED_MEMBER_DIFFERENCES)) {
    assert.ok(
      entry.reason && entry.reason.trim().length > 0,
      `${name}: allow-list entry without a reason`,
    );
    for (const pkg of entry.only) {
      assert.ok(packages.includes(pkg), `${name}: unknown package ${pkg}`);
    }
    const present = packages.filter((pkg) => USE_I18N_MEMBERS[pkg].some((m) => m.name === name));
    if (present.length === packages.length) stale.push(`${name} is on all four bindings now`);
    if (present.length === 0) stale.push(`${name} is on no binding`);
  }
  assert.deepEqual(stale, [], "stale allow-list entries: delete them");
});

test("every binding's useI18n() formatters take the trailing locale override", () => {
  const missing = [];
  for (const [pkg, members] of Object.entries(USE_I18N_MEMBERS)) {
    for (const formatter of FORMATTERS) {
      const member = members.find((m) => m.name === formatter);
      if (!member) {
        missing.push(`${pkg}: ${formatter} absent`);
        continue;
      }
      if (!/\blocale\?:\s*string/.test(resolveMemberType(member.type))) {
        missing.push(`${pkg}: ${formatter} has no \`locale?: string\` parameter`);
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    "formatter arity drift: every binding's formatters end in an optional locale override",
  );
});

// ---------------------------------------------------------------------------
// No placeholders. 0.5 is a new library: a name that is not a member of
// `useI18n()` is not declared on `UseI18nReturn` at all — no `name?: never`
// stub pointing at where it lives instead.
// ---------------------------------------------------------------------------

test("no binding's UseI18nReturn declares a `?: never` placeholder", () => {
  const placeholders = [];
  for (const [pkg, members] of Object.entries(USE_I18N_MEMBERS)) {
    for (const member of members) {
      if (member.type === "never") placeholders.push(`${pkg}: ${member.name}`);
    }
  }
  assert.deepEqual(placeholders, [], "a `never` member is a placeholder, not an API: delete it");
});

// ---------------------------------------------------------------------------
// P8 — `AnyI18nInstance` lives in `@comvi/core`. Each provider used to carry its
// own copy with the same 25-line comment; a copy is where drift starts.
// ---------------------------------------------------------------------------

const PROVIDER_SOURCES = {
  "@comvi/react": "packages/react/src/I18nProvider.tsx",
  "@comvi/solid": "packages/solid/src/context.tsx",
  "@comvi/svelte": "packages/svelte/src/context.ts",
};

test("no wrapper declares AnyI18nInstance locally — it is core's, re-exported", () => {
  const local = Object.entries(PROVIDER_SOURCES).filter(([, relativePath]) =>
    /\btype AnyI18nInstance\s*=/.test(stripComments(readSource(relativePath))),
  );
  assert.deepEqual(
    local.map(([pkg]) => pkg),
    [],
    'AnyI18nInstance must be `import type { AnyI18nInstance } from "@comvi/core"`, never a local declaration',
  );
  assert.match(
    stripComments(readSource("packages/core/src/types.ts")),
    /export type AnyI18nInstance\s*=/,
    "core must declare AnyI18nInstance",
  );
});
