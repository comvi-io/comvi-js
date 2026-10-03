/**
 * The REAL public surface of every `@comvi/*` package in this repo, read from
 * source (lot D2a, gate gap 11.09.2026).
 *
 * Why this file exists. `lint.mjs` lints symbols by PATTERN: it knows that
 * `registerLoader` is not on the base host and that `.with(` is gone, because
 * the 0.5.0 migration guide says so. What it could never know is whether the symbol a fence
 * imports is actually exported by the specifier it names. That gap shipped: when
 * `flattenCatalog` moved off `@comvi/core/loader`, `packages/core/README.md` kept
 * a live fence reading `import { flattenCatalog } from "@comvi/core/loader"`, the
 * pattern rules had nothing to say about it, and `pnpm check:snippets` stayed
 * green through a published README with a broken import.
 *
 * The type-check pass (`--typecheck --sdk-root`) does catch it — by resolving
 * `@comvi/*` through the real exports map and running tsc, which needs a BUILT
 * dist. CI runs that too now (`pnpm check:snippets:types`, in the `build` job
 * after `pnpm build`), so the two halves are both gates. They are still two:
 * `check:snippets` runs in `quality`, where nothing has been built, and a gate
 * whose verdict waits on a 30-minute job is a gate nobody reads. So the
 * resolution here has to be STATIC — no install, no dist, no tsc, just the files
 * already in the working tree.
 *
 * WHERE THE NAMES COME FROM, and why not the other two options:
 *
 *   - NOT the built `.d.ts`. `packages/core/dist/loader.d.ts` is the exact
 *     authority — and it only exists after a build. A gate whose verdict depends
 *     on whether someone ran `pnpm build` is a gate that reports "clean" on a
 *     fresh clone and on CI's first job, which is the same failure as having no
 *     gate. Worse, a STALE dist would answer with the previous release's surface
 *     and vouch for exactly the import this module exists to catch.
 *   - NOT `node_modules/@comvi/*`. In this workspace those are symlinks back to
 *     `packages/*`, so they add a hop and answer nothing new; anywhere else they
 *     are the PUBLISHED surface, which is the thing being checked rather than
 *     the thing to check against.
 *   - SO: the `exports` map in `packages/<pkg>/package.json` for the entry
 *     points, and the SOURCE each entry is built from for the names. The
 *     package.json is the authority on what subpaths exist — it is literally
 *     what Node resolves — and `src/<entry>.ts` is the authority on what they
 *     export, because it is what the build compiles. Both are committed, both
 *     are current in every working tree, and a change to either is a change a
 *     reviewer sees in the diff.
 *
 * Mapping an exports target back to its source is a textual inversion of the
 * build (`./dist/loader.d.ts` → `src/loader.ts`), which sounds fragile and is
 * not: `packages/core/vite.shared.ts#coreEntries` and
 * `packages/nuxt/src/module.ts` both say, in a comment, that the entry name IS
 * the source basename. Where the inversion finds nothing the entry is reported
 * as OPAQUE and no name is ever flagged against it — see `entrySourceFile`.
 *
 * FAIL-SAFE, everywhere, on purpose. This module answers "the package does not
 * export that name" only when it can see the whole surface. A star re-export it
 * cannot resolve (`export * from "some-npm-package"`) marks the entry OPEN and
 * suppresses every missing-name verdict for it; an entry whose source it cannot
 * find is OPAQUE and answers nothing. A false positive here lands on a document
 * that is correct, cannot be cleared by fixing anything, and gets the rule
 * switched off — which costs more than the finding it would have caught.
 */

import fs from "node:fs";
import path from "node:path";

/** Source extensions an entry point can be written in, in resolution order. */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

/**
 * Conditions to follow in an `exports` entry, best first.
 *
 * `types` leads because it is the only condition whose target is reliably a
 * CLEAN basename: core's runtime conditions point at bundle names
 * (`./dist/comvi-core-loader.dev.js`) that invert to no source file, while its
 * `types` points at `./dist/loader.d.ts` — the entry name, which is the source
 * basename. The rest are fallbacks for a package that ships no types, and
 * `default` precedes the runtime-specific ones so a nested
 * `types: { production, default }` resolves to the ordinary build rather than
 * the special-cased one.
 */
const EXPORT_CONDITIONS = [
  "types",
  "default",
  "import",
  "module",
  "svelte",
  "require",
  "node",
  "browser",
  "development",
  "production",
];

/**
 * Build-tool infixes to peel off a target basename: `index.es.js`,
 * `standalone.iife.js`, `comvi-core.dev.js`. The entry name is what is left.
 */
const BUILD_INFIXES = new Set(["es", "cjs", "iife", "umd", "dev", "development", "production"]);

/** Follow `EXPORT_CONDITIONS` into a condition object; `null` when none leads to a string. */
function pickTarget(node) {
  if (typeof node === "string") return node;
  if (node === null || typeof node !== "object" || Array.isArray(node)) return null;
  for (const condition of EXPORT_CONDITIONS) {
    if (!(condition in node)) continue;
    const target = pickTarget(node[condition]);
    if (target !== null) return target;
  }
  return null;
}

/**
 * The `exports` map as `subpath -> target`, with a package that publishes a bare
 * condition object (no `"."` key) normalised to a single `"."`.
 */
function exportsEntries(pkgJson) {
  const map = new Map();
  const exported = pkgJson.exports;
  if (exported === undefined || exported === null) return map;
  if (typeof exported === "string") {
    map.set(".", exported);
    return map;
  }
  const keys = Object.keys(exported);
  if (!keys.some((key) => key.startsWith("."))) {
    map.set(".", pickTarget(exported));
    return map;
  }
  for (const key of keys) map.set(key, pickTarget(exported[key]));
  return map;
}

/**
 * The source file an exports target was built from, or `null`.
 *
 * Textual inversion of the build: drop the `./`, drop the leading `dist/`, drop
 * the declaration or script extension, drop a build infix, then look for that
 * basename under `src/` as a module or as a directory index
 * (`@comvi/plugin-fetch-loader/cdn` is `src/cdn/index.ts`).
 *
 * `null` is a first-class answer — the entry is OPAQUE and the rule will not
 * flag a single name against it. That is the correct verdict for
 * `@comvi/nuxt`'s `./runtime/*` pointing at a file nobody wrote, and for any
 * future entry built some way this inversion does not model.
 */
export function entrySourceFile(pkgDir, target) {
  if (typeof target !== "string" || !target.startsWith("./")) return null;
  let rel = target.slice(2);
  if (rel.startsWith("dist/")) rel = rel.slice("dist/".length);
  rel = rel.replace(/\.d\.(?:ts|mts|cts)$/, "").replace(/\.(?:js|mjs|cjs|jsx)$/, "");
  const lastDot = rel.lastIndexOf(".");
  if (lastDot > rel.lastIndexOf("/") && BUILD_INFIXES.has(rel.slice(lastDot + 1))) {
    rel = rel.slice(0, lastDot);
  }
  if (rel === "" || rel.includes("*")) return null;
  for (const extension of SOURCE_EXTENSIONS) {
    const file = path.join(pkgDir, "src", `${rel}${extension}`);
    if (fs.existsSync(file)) return file;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const file = path.join(pkgDir, "src", rel, `index${extension}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * Comments removed, string literals kept.
 *
 * A doc comment that shows the API it documents — and `packages/core/src/loader.ts`
 * opens with a fenced `import { loader } from "@comvi/core/loader"` in exactly
 * that style — must not read as a re-export. Specifiers stay quoted because the
 * specifier IS the thing being followed.
 */
function stripSourceComments(code) {
  let out = "";
  let index = 0;
  while (index < code.length) {
    const two = code.slice(index, index + 2);
    if (two === "//") {
      const end = code.indexOf("\n", index);
      index = end === -1 ? code.length : end;
      continue;
    }
    if (two === "/*") {
      const end = code.indexOf("*/", index + 2);
      index = end === -1 ? code.length : end + 2;
      continue;
    }
    const char = code[index];
    if (char === '"' || char === "'" || char === "`") {
      const start = index;
      index += 1;
      while (index < code.length) {
        if (code[index] === "\\") {
          index += 2;
          continue;
        }
        if (code[index] === "\n" && char !== "`") break;
        if (code[index] === char) {
          index += 1;
          break;
        }
        index += 1;
      }
      out += code.slice(start, index);
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** Kind flags for one exported name. `value` and `type` are not exclusive. */
function kind(value, type) {
  return { value, type };
}

function mergeName(names, name, flags) {
  const existing = names.get(name);
  if (existing === undefined) names.set(name, { ...flags });
  else {
    existing.value = existing.value || flags.value;
    existing.type = existing.type || flags.type;
  }
}

/** What a declaration keyword exports: a value, a type, or both. */
const DECLARATION_KINDS = {
  const: kind(true, false),
  let: kind(true, false),
  var: kind(true, false),
  function: kind(true, false),
  class: kind(true, true),
  enum: kind(true, true),
  namespace: kind(true, true),
  module: kind(true, true),
  type: kind(false, true),
  interface: kind(false, true),
};

/**
 * One module's own `export` statements, as `{ local, stars, hasDefault }`.
 *
 * `stars` is returned unresolved: following them needs the package index, which
 * this function deliberately does not have — it reads one file and nothing else,
 * which is what makes it testable against a string.
 */
export function parseModuleExports(source) {
  const text = stripSourceComments(source);
  const local = new Map();
  const stars = [];
  let hasDefault = false;

  // `export` at the start of a line, leading whitespace allowed. Every
  // top-level export in these packages is written at column 0, but an `export`
  // nested inside a `declare module { … }` shim block IS matched too: that only
  // ever OVER-reports names (a name the module does not really publish), which
  // is the safe direction for a rule whose only verdict is "missing". Do not
  // tighten this to `^export` without a test for an indented shim export.
  const anchor = /^[^\S\n]*export\b/gm;
  for (const match of text.matchAll(anchor)) {
    const tail = text.slice(match.index + match[0].length);
    const from = /^\s*from\s*(["'])([^"']+)\1/;

    // `export type * from "x"` / `export * from "x"` / `export * as ns from "x"`.
    const star = /^\s*(type\s+)?\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s*)?/.exec(tail);
    if (star !== null) {
      const rest = tail.slice(star[0].length);
      const source_ = from.exec(rest);
      if (source_ === null) continue;
      if (star[2] !== undefined) {
        // `export * as ns` is a namespace OBJECT: one name, and a value.
        mergeName(local, star[2], kind(star[1] === undefined, true));
        continue;
      }
      stars.push({ specifier: source_[2], typeOnly: star[1] !== undefined });
      continue;
    }

    // `export { … }` / `export type { … }`, with or without `from`.
    const clause = /^\s*(type\s+)?\{([^}]*)\}/.exec(tail);
    if (clause !== null) {
      const clauseTypeOnly = clause[1] !== undefined;
      for (const specifier of clause[2].split(",")) {
        const parsed = /^\s*(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(
          specifier,
        );
        if (parsed === null) continue;
        const exported = parsed[3] ?? parsed[2];
        if (exported === "default") {
          hasDefault = true;
          continue;
        }
        const typeOnly = clauseTypeOnly || parsed[1] !== undefined;
        // A bare `export { X }` with no `from` re-exports a LOCAL binding whose
        // kind this statement does not state. `isolatedModules` is on in every
        // package tsconfig, so a type must be written `export { type X }` or
        // `export type { X }` — which means an unmarked name is a value, and
        // treating it as one cannot mistake a value for a type. The reverse
        // mistake is the dangerous one: it would report a legal value import as
        // a type-only export.
        mergeName(local, exported, typeOnly ? kind(false, true) : kind(true, true));
      }
      continue;
    }

    if (/^\s*default\b/.test(tail)) {
      hasDefault = true;
      continue;
    }

    const declaration =
      /^\s*(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const\s+)?(const|let|var|function|class|enum|namespace|module|type|interface)\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(
        tail,
      );
    if (declaration !== null) {
      const flags = DECLARATION_KINDS[declaration[1]];
      if (flags !== undefined) mergeName(local, declaration[2], flags);
    }
  }

  return { local, stars, hasDefault };
}

/** `@comvi/core/loader` → `{ name: "@comvi/core", subpath: "./loader" }`. */
export function splitSpecifier(specifier) {
  if (!specifier.startsWith("@comvi/")) return null;
  const segments = specifier.split("/");
  if (segments.length < 2 || segments[1] === "") return null;
  const name = `${segments[0]}/${segments[1]}`;
  const rest = segments.slice(2).join("/");
  return { name, subpath: rest === "" ? "." : `./${rest}` };
}

/** The exports key matching `subpath`: exact first, then the longest `*` pattern. */
function matchExportKey(keys, subpath) {
  if (keys.includes(subpath)) return { key: subpath, wildcard: null };
  let best = null;
  for (const key of keys) {
    const star = key.indexOf("*");
    if (star === -1) continue;
    const head = key.slice(0, star);
    const tail = key.slice(star + 1);
    if (!subpath.startsWith(head) || !subpath.endsWith(tail)) continue;
    if (subpath.length < head.length + tail.length) continue;
    if (best !== null && head.length <= best.head.length) continue;
    best = { key, head, wildcard: subpath.slice(head.length, subpath.length - tail.length) };
  }
  return best === null ? null : { key: best.key, wildcard: best.wildcard };
}

/**
 * Resolve a relative or `@comvi/*` specifier written INSIDE a package source, to
 * an absolute file. `null` means "not something this module can follow", which
 * is what opens a surface.
 *
 * The `.js` retry is for `@comvi/svelte`, which writes NodeNext specifiers
 * (`from "./context.js"`) against TypeScript sources.
 */
function resolveSourceImport(fromFile, specifier, packages) {
  if (specifier.startsWith(".")) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const withoutJs = base.replace(/\.(?:js|mjs|cjs|jsx)$/, "");
    for (const candidate of [base, withoutJs]) {
      for (const extension of SOURCE_EXTENSIONS) {
        if (fs.existsSync(candidate + extension)) return candidate + extension;
      }
      for (const extension of SOURCE_EXTENSIONS) {
        const index = path.join(candidate, `index${extension}`);
        if (fs.existsSync(index)) return index;
      }
    }
    return null;
  }
  const split = splitSpecifier(specifier);
  if (split === null) return null;
  const pkg = packages.get(split.name);
  if (pkg === undefined) return null;
  const matched = matchExportKey([...pkg.exports.keys()], split.subpath);
  if (matched === null) return null;
  const target = pkg.exports.get(matched.key);
  const resolved =
    matched.wildcard === null ? target : (target ?? "").replace("*", matched.wildcard);
  return entrySourceFile(pkg.dir, resolved);
}

/**
 * Every name an entry point exports, following re-exports through the repo.
 *
 * `closed` is the load-bearing part of the return value: it is `true` only when
 * every star re-export reached a file this module could read. The moment one
 * does not — `export * from "lodash-es"`, a `.svelte` or `.vue` target, a
 * package outside the workspace — the set is a LOWER BOUND and the caller must
 * not conclude that a missing name is absent.
 *
 * Re-exports are followed TRANSITIVELY, not one hop. One hop is not a
 * simplification here, it is a bug: `@comvi/react`'s root says
 * `export type * from "@comvi/core"`, whose root says `export type * from
 * "./types"`, and stopping at the first hop would report every core type
 * imported from a binding root as missing. `visited` makes the walk terminate
 * and makes a cycle contribute nothing rather than hang.
 */
function entryNames(file, packages, cache) {
  const cached = cache.get(file);
  if (cached !== undefined) return cached;
  // Seed the cache before walking so a re-export cycle terminates on the empty
  // seed instead of recursing forever.
  const result = { names: new Map(), closed: true };
  cache.set(file, result);

  let source;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch {
    result.closed = false;
    return result;
  }

  const parsed = parseModuleExports(source);
  for (const [name, flags] of parsed.local) mergeName(result.names, name, flags);
  if (parsed.hasDefault) mergeName(result.names, "default", kind(true, false));

  for (const star of parsed.stars) {
    const target = resolveSourceImport(file, star.specifier, packages);
    if (target === null) {
      result.closed = false;
      continue;
    }
    const inner = entryNames(target, packages, cache);
    if (!inner.closed) result.closed = false;
    for (const [name, flags] of inner.names) {
      // A star NEVER re-exports the target's default (ECMAScript), and
      // `export type *` brings the names across as types only.
      if (name === "default") continue;
      mergeName(result.names, name, star.typeOnly ? kind(false, true) : flags);
    }
  }
  return result;
}

/**
 * The surface of every `@comvi/*` package under `<root>/packages`, or `null`
 * when there is none.
 *
 * `null` is what keeps the mirrored copy honest. This module is COPIED into the
 * www repository (see `module-sha.mjs`), which has no `packages/` tree: there,
 * every `@comvi/*` specifier would resolve to an unknown package and the gate
 * would report a wall of findings against documents that are correct. So the
 * rule is INERT wherever the workspace sources are not present, and says so
 * rather than guessing.
 */
export function loadRepoSurface(root) {
  const packagesDir = path.join(root, "packages");
  if (!fs.existsSync(packagesDir)) return null;

  const packages = new Map();
  for (const entry of fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesDir, entry.name);
    const manifest = path.join(dir, "package.json");
    if (!fs.existsSync(manifest)) continue;
    let pkgJson;
    try {
      pkgJson = JSON.parse(fs.readFileSync(manifest, "utf8"));
    } catch {
      continue;
    }
    if (typeof pkgJson.name !== "string" || !pkgJson.name.startsWith("@comvi/")) continue;
    packages.set(pkgJson.name, { dir, exports: exportsEntries(pkgJson) });
  }
  if (packages.size === 0) return null;

  const cache = new Map();
  /** Lazily built `name -> specifier[]`, for "the symbol actually lives here". */
  let index = null;

  function entryOf(specifier) {
    const split = splitSpecifier(specifier);
    if (split === null) return { status: "not-comvi" };
    const pkg = packages.get(split.name);
    if (pkg === undefined) return { status: "unknown-package", package: split.name };
    const keys = [...pkg.exports.keys()];
    const matched = matchExportKey(keys, split.subpath);
    if (matched === null) {
      return {
        status: "unknown-subpath",
        package: split.name,
        subpath: split.subpath,
        published: keys.filter((key) => !key.includes("*")).sort(),
      };
    }
    const target = pkg.exports.get(matched.key);
    const resolved =
      matched.wildcard === null ? target : (target ?? "").replace("*", matched.wildcard);
    const file = entrySourceFile(pkg.dir, resolved);
    if (file === null) return { status: "opaque", package: split.name, subpath: split.subpath };
    const { names, closed } = entryNames(file, packages, cache);
    return { status: "ok", package: split.name, subpath: split.subpath, names, closed, file };
  }

  /**
   * Every named entry point, as the specifier a document writes. Wildcard keys
   * are excluded: `@comvi/nuxt/runtime/*` is a FAMILY, not an entry, and has no
   * name set until a concrete subpath picks a member.
   */
  function entrySpecifiers() {
    const out = [];
    for (const [name, pkg] of [...packages].sort((a, b) => a[0].localeCompare(b[0]))) {
      const keys = [...pkg.exports.keys()]
        .filter((key) => !key.includes("*"))
        .sort((a, b) => (a === "." ? -1 : b === "." ? 1 : a.localeCompare(b)));
      for (const key of keys) out.push(key === "." ? name : `${name}/${key.slice(2)}`);
    }
    return out;
  }

  function buildIndex() {
    const out = new Map();
    for (const specifier of entrySpecifiers()) {
      const entry = entryOf(specifier);
      if (entry.status !== "ok") continue;
      for (const [exported, flags] of entry.names) {
        if (exported === "default") continue;
        if (!out.has(exported)) out.set(exported, []);
        out.get(exported).push({ specifier, ...flags });
      }
    }
    return out;
  }

  return {
    /** Package names, for tests and for the report. */
    packageNames: () => [...packages.keys()].sort(),
    entrySpecifiers,
    resolve: entryOf,
    /**
     * Entry points exporting `name`, the ones in `preferPackage` first. This is
     * what turns a finding into a fix: "does not export flattenCatalog" is a
     * complaint, "it is exported from @comvi/core" is a patch.
     */
    whereIs(name, preferPackage) {
      if (index === null) index = buildIndex();
      const hits = index.get(name) ?? [];
      return [...hits].sort((a, b) => {
        const aOwn = preferPackage !== undefined && a.specifier.startsWith(preferPackage) ? 0 : 1;
        const bOwn = preferPackage !== undefined && b.specifier.startsWith(preferPackage) ? 0 : 1;
        return aOwn - bOwn;
      });
    },
  };
}
