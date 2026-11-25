/**
 * Symbol-lint for the docs snippet gate (lot D2a).
 *
 * A type-checker can only fail on API that is PRESENT and wrong. The drift these
 * two doc surfaces actually suffered is the other kind: a composition call
 * appears zero times across ~40 site pages, and no compiler will ever notice an
 * API that was never written. Prose is worse still — `react.mdx:39` states that
 * `registerLoader()` is a method on the core instance, which stopped being true
 * in 0.5.0 and compiles under nothing. So this file lints SYMBOLS: what must not
 * appear, what must appear, and what the page claims in English.
 *
 * Every rule below cites where its API fact comes from, in the rule and in the
 * message a reader sees: the 0.5 rules a section of `MIGRATION.md`, the 0.8
 * rules the changeset that removed the form. That document was retired
 * from the tree once the site dropped its upgrade guide (0.4 had no external
 * users); the sections the citations name are at
 * https://github.com/comvi-io/comvi-js/blob/dbc91b5f88415e1905cb49885c644f4bee1dd90d/MIGRATION.md
 * and the citations stay, because they are the provenance of each rule.
 *
 * ONE rule is derived from somewhere else, and it is the exception that proves
 * the shape of the rest. `banned/unresolved-comvi-import` cites no section: it
 * RESOLVES each `@comvi/*` specifier against that package's `exports` map and
 * each imported name against the source the entry is built from (`surface.mjs`).
 * It exists because pattern-lint has one blind spot by construction — a symbol
 * that is neither banned nor required, merely imported from the wrong place —
 * and that blind spot shipped: `flattenCatalog` left `@comvi/core/loader`, a
 * live README fence kept importing it from there, and every rule above had
 * nothing to say.
 *
 * The 0.8 instance (stage D, 25.11.2026). `createI18n(options)` returns twelve
 * members — `locale`, `dir`, `ready`, `t`, `ns`, `setLocale`, `load`, `add`,
 * `has`, `on`, `rev`, `destroy` — and everything 0.7 composed onto it is a
 * constructor option now: `loader: cdn(url)` from `@comvi/core/cdn`,
 * `plugins: [detect({ supported }), devtools()]`, ICU always on (there is no compiler to
 * name). So the 0.7 REQUIRED rules (`.use(installer)` on every framework page,
 * `compiler: icuCompiler` beside every ICU catalog) are gone, and what they
 * required is BANNED: `.use(` on the instance, `icuCompiler`, `i18n.init()`,
 * and the subpaths and packages 0.8 removed (`.changeset/core-08-*.md`,
 * `next-08-binding.md`, `nuxt-08-binding.md`; the built `exports` maps). No
 * capability is acquired any more, so no rule is scoped to a chain: every
 * banned rule is a fact about the fence it fires in.
 *
 * `.use(` is judged BY RECEIVER, because the word is not ours: Vue's
 * `app.use(i18n)` installs the Vue plugin `@comvi/vue` returns and stays the
 * documented 0.8 form, and `i18next.use(…)` is a competitor's verb quoted on a
 * comparison page (see `isInstanceCall`).
 */

import path from "node:path";
import { extractFences, extractProse, parseFrontmatter } from "./extract.mjs";
import { splitSpecifier } from "./surface.mjs";

/** Fence languages whose contents are comvi code worth linting. */
const CODE_LANGS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "mts",
  "cts",
  "vue",
  "svelte",
  "astro",
  "diff",
]);

/** Fence languages that carry a single-file-component `<script>` block. */
const SFC_LANGS = new Set(["vue", "svelte"]);

/**
 * Import specifiers that belong to another i18n library. Migration guides quote
 * competitor code on purpose, and linting it for comvi symbols is noise, so such
 * a fence is skipped by RULE and counted in its own category (docs-0.5 plan §6.2).
 */
const FOREIGN_SPECIFIERS = [
  "react-intl",
  "next-intl",
  "i18next",
  "react-i18next",
  "vue-i18n",
  "@formatjs/",
  "svelte-i18n",
  "@lingui/",
];

/**
 * Framework pages: the guides a reader sets an app up from. The class is
 * reported in the stats; since 0.8 no rule depends on it (the 0.7 one that did,
 * `required/use-composition`, demanded the `.use(installer)` 0.8 removed).
 */
const FRAMEWORK_BASENAMES = new Set([
  "connect-comvi",
  "react",
  "vue",
  "svelte",
  "solid",
  "next",
  "nuxt",
  "vanilla",
]);

/** README basenames (the package directory) classified the same way. */
const FRAMEWORK_PACKAGES = new Set([
  "core",
  "react",
  "vue",
  "svelte",
  "solid",
  "next",
  "nuxt",
  "plugin-fetch-loader",
  "plugin-locale-detector",
  "plugin-in-context-editor",
]);

/**
 * Classify a document from its path. The class decides which REQUIRED rules run;
 * BANNED and prose rules run on everything.
 */
export function classify(file) {
  const posix = file.split(path.sep).join("/");
  const base = path.basename(posix).replace(/\.(mdx|md)$/, "");
  const classes = new Set();

  // `docs/design/**` is a corpus of decision records, and its own README is an
  // INDEX of them — a table of links, addressed to a contributor who already
  // knows what the host is. It owes no walkthrough of anything, so no required
  // rule applies to it. Before this class existed, `docs/design/README.md` fell
  // through to the branch below, where `pkg === undefined` means "an installed
  // package README whose directory we cannot see" and grants `framework` — so
  // the index owed a `.use(installer)` fence and was given one that existed
  // only to satisfy the rule. A gate that makes a page carry code it has no
  // reason to show is a gate teaching the corpus to lie to it.
  //
  // The banned-token rules and `prose/stale-size-figure` still run here, which
  // is the whole point of having a class rather than an exemption: a record
  // that names a removed API or quotes a stale size figure is exactly as wrong
  // as a README that does.
  if (/(?:^|\/)docs\/design\//.test(posix)) {
    classes.add("design");
    return classes;
  }

  if (base === "README") {
    // Both layouts name the same package: `packages/cli/README.md` in this repo,
    // `node_modules/@comvi/cli/README.md` once www checks the published copies.
    // Matching only the first made every non-framework package's INSTALLED
    // README owe a `.use(` its own source is rightly not asked for.
    const pkg = posix.match(/(?:packages|@comvi)\/([^/]+)\/README\.md$/)?.[1];
    if (pkg === undefined || FRAMEWORK_PACKAGES.has(pkg)) {
      classes.add("framework");
    }
    return classes;
  }

  // `api/react.mdx` is a reference page, not the react guide: it owes a version
  // stamp rather than a composition walkthrough, so the classes are exclusive.
  if (/\/api\/[^/]+$/.test(posix)) {
    classes.add("api");
    return classes;
  }
  if (FRAMEWORK_BASENAMES.has(base)) classes.add("framework");
  return classes;
}

/**
 * Receivers whose `.use(` / `.init(` is somebody else's verb, and always was.
 * Vue's app (`app`, `nuxtApp.vueApp`) installs the Vue plugin `@comvi/vue`'s
 * `createI18n` returns — `app.use(i18n)` is the documented 0.8 form — and
 * Express-shaped `server` / `router` install middleware, and `i18next.use(…)` /
 * `i18next.init(…)` are a competitor's own calls quoted on a comparison page.
 * None of them is the comvi instance.
 */
const FOREIGN_RECEIVERS = new Set([
  "app",
  "vueApp",
  "nuxtApp",
  "vue",
  "server",
  "router",
  "i18next",
  "createApp",
  "createSSRApp",
]);

/**
 * The names the docs give the instance. A receiver spelled this way is the
 * instance whether or not the fence shows where it came from — site fences
 * routinely start at `i18n.…` with the construction three fences above.
 */
const INSTANCE_NAMES = new Set(["i18n", "$i18n", "core"]);

/**
 * Factories whose result is the instance: the 0.8 `createI18n` of every
 * package, and the 0.7 factories a page may still chain `.use(` onto
 * (`createNextI18n`, `createCore`, gone in 0.8 — `next-08-binding.md`).
 */
const INSTANCE_FACTORIES = new Set(["createI18n", "createNextI18n", "createCore"]);

/**
 * The 0.7 installers and raw plugin factories, by name. One of them in the
 * `.use(` slot is 0.7 composition whatever the receiver is called — `host`,
 * `instance`, a chain that starts off-fence — unless the receiver is foreign.
 */
const INSTALLER_NAMES = [
  "loader",
  "attachLoader",
  "plugins",
  "attachPlugins",
  "definePlugin",
  "devtools",
  "attachDevtools",
  "fetchLoader",
  "cdnLoader",
  "localeDetector",
  "inContextEditor",
  "icu",
  "nextPlugin",
  "nextPluginLazy",
  "cdnLoaderPlugin",
  "fetchLoaderPlugin",
  "localeDetectorPlugin",
  "inContextEditorPlugin",
];

const INSTALLER_ARGUMENT = new RegExp(
  String.raw`^\s*(?:(?:${INSTALLER_NAMES.join("|")})\s*\(|attach(?:Loader|Plugins|Devtools)\b)`,
);

/** `.use(` and `.init(`, optional chaining included; the receiver is read separately. */
const USE_CALL = /\??\.\s*use\s*\(/g;
const INIT_CALL = /\??\.\s*init\s*\(/g;

/**
 * Index of the bracket that opens the group closing at `close`, or -1.
 *
 * Counts brackets only: a `)` inside a string literal of the options object
 * would shift it, which no fence of either corpus writes, and the cost of the
 * miss is one unread receiver rather than a wrong finding.
 */
function openingBracket(text, close) {
  let depth = 0;
  for (let index = close; index >= 0; index -= 1) {
    const char = text[index];
    if (char === ")" || char === "]" || char === "}") depth += 1;
    else if (char === "(" || char === "[" || char === "{") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * The receiver in front of the `.` at `dotIndex`: its LAST segment (`tail`,
 * `""` when the receiver ends in a call or an index) and the identifier the
 * whole member/call chain starts from (`root`).
 *
 * `nuxtApp.$i18n.use(` → tail `$i18n`, root `nuxtApp`;
 * `createI18n({…}).use(` → tail `""`, root `createI18n`;
 * `createApp(App).use(router).use(` → tail `""`, root `createApp`.
 */
export function receiverOf(text, dotIndex) {
  let index = dotIndex - 1;
  let tail = null;
  let root = "";
  const skipSpace = () => {
    while (index >= 0 && /\s/.test(text[index])) index -= 1;
  };
  for (;;) {
    skipSpace();
    if (index >= 0 && text[index] === "?") {
      index -= 1;
      skipSpace();
    }
    let called = false;
    while (index >= 0 && (text[index] === ")" || text[index] === "]")) {
      called = true;
      const open = openingBracket(text, index);
      if (open === -1) return { tail: tail ?? "", root };
      index = open - 1;
      skipSpace();
    }
    const end = index + 1;
    while (index >= 0 && /[\w$]/.test(text[index])) index -= 1;
    const name = text.slice(index + 1, end);
    if (tail === null) tail = called ? "" : name;
    if (name === "") return { tail, root };
    root = name;
    skipSpace();
    if (index >= 0 && text[index] === ".") {
      index -= 1;
      continue;
    }
    return { tail, root };
  }
}

/** Bindings the fence assigns from an instance factory: `const i18n = createI18n(…)`. */
function instanceBindings(text) {
  const names = new Set();
  const factories = [...INSTANCE_FACTORIES].join("|");
  const pattern = new RegExp(
    String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:${factories})\s*\(`,
    "g",
  );
  for (const match of text.matchAll(pattern)) names.add(match[1]);
  return names;
}

/**
 * Is the member call whose `.` sits at `dotIndex` made on the comvi instance?
 *
 * The receiver's own name decides first, then the chain's root: `nuxtApp.$i18n`
 * is the instance though its root is Nuxt's app, `nuxtApp.vueApp` is Vue's app
 * though nothing in it is foreign but the tail. A receiver that names neither
 * is the instance only when the argument proves it (`argument` set and an
 * installer by name) — `host.use(loader())` is 0.7 composition, `x.use(y)` is
 * nobody's business.
 */
function isInstanceCall(text, dotIndex, bindings, argument = null) {
  const { tail, root } = receiverOf(text, dotIndex);
  if (INSTANCE_NAMES.has(tail) || bindings.has(tail)) return true;
  if (FOREIGN_RECEIVERS.has(tail) || FOREIGN_RECEIVERS.has(root)) return false;
  if (INSTANCE_NAMES.has(root) || bindings.has(root) || INSTANCE_FACTORIES.has(root)) return true;
  return argument !== null && INSTALLER_ARGUMENT.test(argument);
}

/** Every `.use(` / `.init(` call the fence makes on the instance. */
function instanceCalls(text, pattern, { withArgument }) {
  const bindings = instanceBindings(text);
  const matches = [];
  for (const match of text.matchAll(pattern)) {
    const dot = match.index + match[0].indexOf(".");
    const argument = withArgument ? text.slice(match.index + match[0].length) : null;
    if (isInstanceCall(text, dot, bindings, argument)) {
      matches.push({ index: match.index, text: match[0].replace(/^\?/, "") });
    }
  }
  return matches;
}

/**
 * The entry points 0.8 removed, as text — so the rule needs no `packages/`
 * tree and fires in the www copy too, where `banned/unresolved-comvi-import`
 * is inert. Core lost `/icu`, `/loader`, `/rich-text`, `/tags` and
 * `/editor-bridge` (`core-08-compile-foundation.md`); the three plugin
 * packages are gone; `@comvi/next` lost its root and `/config`
 * (`next-08-binding.md`), `@comvi/nuxt` its `/setup` (`nuxt-08-binding.md`).
 * The bare `@comvi/next` only counts quoted, so `@comvi/next/server` and a
 * sentence naming the package are left alone. In this repo the same import is
 * also `banned/unresolved-comvi-import` (the surface knows the subpath is
 * missing); this rule is the half that needs no surface and says what replaced it.
 */
const REMOVED_ENTRY_SOURCE =
  String.raw`@comvi\/(?:core\/(?:loader|icu|rich-text|tags|editor-bridge)|plugin-(?:fetch-loader|locale-detector|in-context-editor)|next\/config|nuxt\/setup)(?![\w-])` +
  String.raw`|(["'])@comvi\/next\1`;
const REMOVED_ENTRY = new RegExp(REMOVED_ENTRY_SOURCE, "g");

/** The removed `icu` installer's imported name, `icuCompiler` deliberately excluded. */
const ICU_INSTALLER_IMPORT = /^\s*(?:type\s+)?(icu)(?![\w$])/;

/** A receiver in front of a capability call (see the registerLoader rule). */
const CAPABILITY_RECEIVER = String.raw`(?:[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*|\)|\])`;

/** `<receiver>.<member>(` for a capability member, optional chaining included. */
function capabilityCallPattern(member) {
  return new RegExp(`${CAPABILITY_RECEIVER}\\s*\\??\\.\\s*${member}\\s*\\(`, "g");
}

const REGISTER_LOADER_CALL = capabilityCallPattern("registerLoader");
const REGISTER_PLUGIN_CALL = capabilityCallPattern("registerPlugin");

/**
 * The lines of a fence that are real code. In a `diff` fence a `-` line is the
 * BEFORE state — `packages/vue/README.md` shows `-i18n.registerLoader(myLoader);`
 * directly above its replacement — so linting it would flag the very example
 * that teaches the fix.
 */
function codeLines(fence) {
  if (fence.lang !== "diff") return fence.lines;
  return fence.lines.filter((line) => !line.text.startsWith("-"));
}

/** Why a fence is skipped, or `null` when it is linted. */
function skipCategory(fence) {
  if (fence.check.skip) return fence.check.skipReason ?? "unspecified";
  const code = fence.code;
  const importRe =
    /(?:^|\n)\s*(?:import|export)[^\n]*?from\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g;
  for (const match of code.matchAll(importRe)) {
    const specifier = match[1] ?? match[2];
    if (/^https?:\/\//.test(specifier)) return "url-import";
    if (FOREIGN_SPECIFIERS.some((foreign) => specifier.startsWith(foreign)))
      return "foreign-import";
  }
  return null;
}

/**
 * The start of an `import` / `export` STATEMENT, in the shapes a fence writes.
 *
 * Anchored at a line start or after a `;`, which is what makes a one-line
 * `import React from "react"; import { useI18n } from "@comvi/react";` two
 * statements rather than one — the site and the READMEs both write that.
 *
 * The anchor is also what makes scanning the RAW fence text (comments included,
 * exactly as the other banned rules do) safe: a commented-out import reads
 * `// import { … }` or ` * import { … }`, and neither `/` nor `*` is whitespace,
 * so the anchor never reaches the keyword. `\+?` admits a diff fence's ADDED
 * line; `codeLines` has already dropped the `-` side.
 */
const IMPORT_ANCHOR = /(?:^|[\n;])[^\S\n]*\+?[^\S\n]*(import|export)(?![\w$])/g;

/**
 * `<clause> from "<specifier>"`. The clause alternatives are the whole ES
 * grammar a doc uses: a brace list, a namespace, a default binding, or a
 * default binding followed by one of the other two. `[^}]*` spans newlines on
 * purpose — a long import clause is wrapped by the formatter — and cannot
 * over-run, because an import clause has no nested braces.
 */
const CLAUSE_FROM =
  /^(\s*)((?:type\s+)?(?:\{[^}]*\}|\*(?:\s*as\s+[A-Za-z_$][\w$]*)?|[A-Za-z_$][\w$]*(?:\s*,\s*(?:\{[^}]*\}|\*\s*as\s+[A-Za-z_$][\w$]*))?))\s*from\s*(["'])([^"'\n]+)\3/;

/** `import "<specifier>"` — a side-effect import, which has no clause. */
const BARE_IMPORT = /^(\s*)(["'])([^"'\n]+)\2/;

/** One brace-list entry: `a`, `a as b`, `type A`, `type A as B`, `default as X`. */
const IMPORT_BINDING = /^(\s*)(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/;

/**
 * Split an import clause into what it actually asks the module for.
 *
 * `at` is the clause's offset in the fence, and every binding carries its own
 * offset, so a finding lands on the NAME rather than on the line — the same
 * precision `banned/icu-compiler` reports its `icu` import half with.
 */
function parseImportClause(clause, at) {
  const names = [];
  let namespace = false;
  let defaultBinding = null;
  let rest = clause;
  let offset = at;

  const typePrefix = /^type\s+/.exec(rest);
  const clauseTypeOnly = typePrefix !== null;
  if (typePrefix !== null) {
    rest = rest.slice(typePrefix[0].length);
    offset += typePrefix[0].length;
  }

  if (!rest.startsWith("{") && !rest.startsWith("*")) {
    const binding = /^([A-Za-z_$][\w$]*)\s*(?:,\s*)?/.exec(rest);
    if (binding !== null) {
      defaultBinding = { typeOnly: clauseTypeOnly, index: offset };
      rest = rest.slice(binding[0].length);
      offset += binding[0].length;
    }
  }

  if (rest.startsWith("*")) return { names, namespace: true, defaultBinding };
  if (!rest.startsWith("{")) return { names, namespace, defaultBinding };

  const close = rest.lastIndexOf("}");
  const inner = rest.slice(1, close === -1 ? rest.length : close);
  let cursor = offset + 1;
  for (const part of inner.split(",")) {
    const parsed = IMPORT_BINDING.exec(part);
    if (parsed !== null) {
      const index = cursor + parsed[1].length + (parsed[2]?.length ?? 0);
      const typeOnly = clauseTypeOnly || parsed[2] !== undefined;
      // `{ default as X }` asks for the default export, not for a name.
      if (parsed[3] === "default") defaultBinding = { typeOnly, index };
      else names.push({ imported: parsed[3], typeOnly, index });
    }
    cursor += part.length + 1;
  }
  return { names, namespace, defaultBinding };
}

/**
 * Every module specifier a fence imports, with the names it asks for.
 *
 * Dynamic `import("…")` is included with no names: the specifier is all it
 * states, and a wrong specifier is still a broken snippet.
 */
export function parseFenceImports(text) {
  const statements = [];
  for (const match of text.matchAll(IMPORT_ANCHOR)) {
    const keyword = match[1];
    const keywordAt = match.index + match[0].length - keyword.length;
    const tail = text.slice(match.index + match[0].length);

    const clause = CLAUSE_FROM.exec(tail);
    if (clause !== null) {
      const clauseAt = match.index + match[0].length + clause[1].length;
      statements.push({
        keyword,
        specifier: clause[4],
        index: keywordAt,
        statement: `${keyword} ${clause[2].replace(/\s+/g, " ").trim()} from "${clause[4]}"`,
        ...parseImportClause(clause[2], clauseAt),
      });
      continue;
    }
    // `export "x"` is not a thing; only a side-effect IMPORT has no clause.
    if (keyword !== "import") continue;
    const bare = BARE_IMPORT.exec(tail);
    if (bare !== null) {
      statements.push({
        keyword,
        specifier: bare[3],
        index: keywordAt,
        statement: `import "${bare[3]}"`,
        names: [],
        namespace: false,
        defaultBinding: null,
      });
    }
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*(["'])([^"'\n]+)\1/g)) {
    statements.push({
      keyword: "import",
      specifier: match[2],
      index: match.index,
      statement: `import("${match[2]}")`,
      names: [],
      namespace: false,
      defaultBinding: null,
    });
  }
  return statements;
}

/**
 * `@comvi/core` — where the symbol actually lives, as a fix rather than a list.
 *
 * A VALUE import gets only the entries that publish it as a value when any do.
 * Without that filter the `flattenCatalog` finding read "exported from
 * @comvi/core, @comvi/next (as a type only), @comvi/react (as a type only)":
 * every binding root re-exports core's TYPES with `export type *`, so a
 * type-only echo of the name appears on five of them and buries the one answer
 * a reader can act on. Type-only hits are still named when they are all there
 * is, because then the fix is `import type`.
 */
function nameAlternatives(hits, wantValue) {
  const usable =
    wantValue && hits.some((hit) => hit.value) ? hits.filter((hit) => hit.value) : hits;
  return usable
    .slice(0, 3)
    .map((hit) => (wantValue && !hit.value ? `${hit.specifier} (as a type only)` : hit.specifier))
    .join(", ");
}

/**
 * Banned code patterns. Each is a fact about the fence it fires in: 0.8 has no
 * capability a chain could acquire, so nothing elsewhere on the page clears one.
 *
 * `find(text, context)` — the second argument carries the run's package surface
 * and is read by exactly one rule; every other rule reasons from the text alone
 * and ignores it.
 */
const BANNED_RULES = [
  {
    id: "banned/unresolved-comvi-import",
    // Not a MIGRATION.md rule, and saying so matters: every other entry here
    // cites the guide because the guide is what makes the symbol wrong. This
    // one cites the PACKAGE, because the package is the authority on what it
    // exports and no prose can overrule it.
    migration:
      "packages/<pkg>/package.json `exports` and the source each entry is built from " +
      "(resolved statically — see scripts/docs-snippets/surface.mjs)",
    find(text, context) {
      const surface = context?.surface;
      // Inert without the workspace sources. The www copy of this module has no
      // `packages/` tree to resolve against (see `loadRepoSurface`), and a rule
      // that cannot see the surface must answer nothing rather than everything.
      if (!surface) return [];

      const matches = [];
      const report = (statement, index, message) => {
        matches.push({ index, text: statement.statement, message });
      };

      for (const statement of parseFenceImports(text)) {
        if (splitSpecifier(statement.specifier) === null) continue;
        const entry = surface.resolve(statement.specifier);

        if (entry.status === "unknown-package") {
          report(
            statement,
            statement.index,
            `there is no ${entry.package} package in this repo — nothing under packages/* ` +
              "publishes that name.",
          );
          continue;
        }
        if (entry.status === "unknown-subpath") {
          report(
            statement,
            statement.index,
            `${entry.package} has no "${entry.subpath}" entry: an import of it fails to resolve. ` +
              `Its exports map publishes ${entry.published.join(", ")}.`,
          );
          continue;
        }
        // OPAQUE: the entry exists but this module could not find the source it
        // is built from. NOT-COMVI cannot happen here. Either way, no names.
        if (entry.status !== "ok") continue;
        // An OPEN surface is a lower bound, so "not exported" is unprovable.
        // Reported subpaths above stay, because the exports map is complete
        // whatever the sources do.
        if (!entry.closed) continue;

        if (statement.defaultBinding !== null && !entry.names.has("default")) {
          report(
            statement,
            statement.defaultBinding.index,
            `${statement.specifier} has no default export.`,
          );
        }

        for (const name of statement.names) {
          const flags = entry.names.get(name.imported);
          if (flags === undefined) {
            const hits = surface
              .whereIs(name.imported, entry.package)
              .filter((hit) => hit.specifier !== statement.specifier);
            report(
              statement,
              name.index,
              `${statement.specifier} has no export named ${name.imported}` +
                (hits.length > 0
                  ? `. It is exported from ${nameAlternatives(hits, !name.typeOnly)} — import it from there.`
                  : ", and no @comvi/* entry point in this repo exports that name."),
            );
            continue;
          }
          // A TYPE import of a value is legal TypeScript and always was, so only
          // the other direction is a finding: a VALUE import of a type-only
          // export survives `tsc` and breaks in any bundler that does not elide
          // the binding.
          if (!name.typeOnly && !flags.value) {
            report(
              statement,
              name.index,
              `${name.imported} is a type-only export of ${statement.specifier}: import it as ` +
                `\`import type { ${name.imported} }\` or \`{ type ${name.imported} }\`, or the ` +
                "binding is missing at runtime.",
            );
          }
        }
      }
      return matches;
    },
    message:
      "this import does not resolve against the package it names. The specifier is checked " +
      "against that package's `exports` map and the name against the source the entry is built " +
      "from, so a README fence cannot name API the package does not publish.",
  },
  {
    id: "banned/use-on-instance",
    migration:
      ".changeset/core-08-instance.md (the twelve members) and core-08-cdn-store.md (`cdn`, `api`)",
    find(text) {
      // Every 0.7 `.use(…)` — an installer, a raw plugin, `icu()` — is the
      // same finding, because 0.8 has one answer for all of them: the
      // instance has no `use` member, and what it composed is an option.
      return instanceCalls(text, USE_CALL, { withArgument: true });
    },
    message:
      "the 0.8 instance has no .use(): pass what it composed as createI18n options — " +
      "`loader: cdn(url)` (or `api(base, { key })`) from @comvi/core/cdn, " +
      "`plugins: [detect({ supported }), devtools()]` from @comvi/core/plugins and /devtools. " +
      "Vue's `app.use(i18n)` is a different verb and stays.",
  },
  {
    id: "banned/instance-init",
    migration: ".changeset/core-08-instance.md (synchronous construction, no `init()`)",
    find(text) {
      return instanceCalls(text, INIT_CALL, { withArgument: false });
    },
    message:
      "0.8 constructs synchronously and has no init(): await `i18n.ready` for the first " +
      "load, or `i18n.load(ns)` / `i18n.setLocale(locale)` for a later one.",
  },
  {
    id: "banned/icu-compiler",
    migration: ".changeset/core-08-compile-foundation.md (one grammar, ICU MessageFormat)",
    find(text) {
      const matches = [];
      // `compiler: icuCompiler`, its import and any other mention of the name:
      // 0.8 compiles ICU MessageFormat always, and has no `compiler` option.
      for (const match of text.matchAll(/\bicuCompiler\b/g)) {
        matches.push({ index: match.index, text: match[0] });
      }
      // The removed `icu` installer, by its IMPORTED name — the half that
      // survives an alias: `import { icu as installIcu }` writes
      // `installIcu()` at the call site. Its call `.use(icu())` is
      // `banned/use-on-instance`. Specifiers are read one at a time so only
      // the imported name is inspected. The optional `+` is a diff fence's
      // ADDED line: `codeLines` already dropped the `-` side.
      const importRe =
        /(?:^|[\n;])[^\S\n]*\+?[^\S\n]*(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*(["'])(@comvi\/[^"']*)\2/g;
      for (const match of text.matchAll(importRe)) {
        const clause = match[1];
        const clauseAt = match.index + match[0].indexOf("{") + 1;
        let cursor = 0;
        for (const specifier of clause.split(",")) {
          const named = ICU_INSTALLER_IMPORT.exec(specifier);
          if (named !== null) {
            matches.push({
              index: clauseAt + cursor + named[0].length - named[1].length,
              text: `import { ${named[1]} } from "${match[3]}"`,
            });
          }
          cursor += specifier.length + 1;
        }
      }
      return matches;
    },
    message:
      "0.8 compiles ICU MessageFormat (plural, select, selectordinal, `#`) with no option: " +
      "there is no `compiler` option, no `icuCompiler` and no `icu()` installer. Delete it.",
  },
  {
    id: "banned/removed-entry",
    migration:
      ".changeset/core-08-compile-foundation.md (removed subpaths), next-08-binding.md, " +
      "nuxt-08-binding.md; the packages' `exports` maps",
    find(text) {
      const matches = [];
      for (const match of text.matchAll(REMOVED_ENTRY)) {
        matches.push({ index: match.index, text: match[0].replace(/["']/g, "") });
      }
      return matches;
    },
    message:
      "this entry point is gone in 0.8. @comvi/core publishes `.`, /cdn, /plugins, /format, " +
      "/devtools and /ssr (ICU and rich text are built in, the fetch loader is `cdn` from " +
      "/cdn, the detector `detect` from /plugins, the editor `devtools()`); @comvi/next " +
      "publishes /server, /client and its routing entries but no root; @comvi/nuxt has no /setup.",
  },
  {
    id: "banned/register-loader-on-instance",
    migration: ".changeset/core-08-instance.md (the `loader` option)",
    find(text) {
      // Any receiver SHAPE counts, not just an identifier chain:
      // `createI18n({…}).registerLoader(fn)` and `hosts[0].registerLoader(fn)`
      // are the same mistake as `i18n.registerLoader(fn)`. Only a BARE call is
      // exempt — it is a reader's own function of that name.
      const matches = [];
      for (const match of text.matchAll(REGISTER_LOADER_CALL)) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "registerLoader() is not on the 0.8 instance: pass `loader` to createI18n — " +
      "`loader: cdn(url)` from @comvi/core/cdn, or your own `(locale, ns, signal) => catalog`.",
  },
  {
    id: "banned/register-plugin-without-plugins",
    migration: ".changeset/core-08-instance.md (the `plugins` option)",
    find(text) {
      // A RECEIVER is required, as in the registerLoader rule, and in any shape:
      // `createI18n({…}).registerPlugin(fn)`, `getI18n().registerPlugin(fn)`,
      // `i18n?.registerPlugin(fn)`, `hosts[0].registerPlugin(fn)`.
      const matches = [];
      for (const match of text.matchAll(REGISTER_PLUGIN_CALL)) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "registerPlugin() is not on the 0.8 instance: list plugins in the constructor, " +
      "`plugins: [detect({ supported }), devtools(), myPlugin]`.",
  },
  {
    id: "banned/slim-entry",
    migration: "MIGRATION.md §3 (Renames: `@comvi/<pkg>/slim` and `createSlimI18n`)",
    find(text) {
      const matches = [];
      for (const match of text.matchAll(
        /@comvi\/[a-z-]+(?:\/[a-z-]+)*\/slim\b|\bcreateSlimI18n\b/g,
      )) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "the slim entry is gone in 0.5.0 — each package publishes ONE entry. " +
      "Use `@comvi/<pkg>` and `createI18n`.",
  },
  {
    id: "banned/with-composition",
    migration: "MIGRATION.md §3 and .changeset/core-08-instance.md",
    find(text) {
      const matches = [];
      // No provenance check, and none is wanted: a foreign-import fence is
      // already skipped by RULE (`skipCategory`), so a `.with(` reaching this
      // rule sits in a comvi fence, where `.with` named exactly one thing —
      // the composition verb that decision E retired, and that 0.8 has no
      // replacement for either.
      //
      // The ARGUMENT is tested, though, because `with` is not a comvi-only
      // word: `date.with({ month: 2 })` is Temporal and `locales.with(0, "en")`
      // is Array.prototype.with. A composition step hands `with` a CALL — the
      // installer — or a bare `attach*` reference; a plain object, a number or
      // a string argument is somebody else's `with` and is none of our business.
      for (const match of text.matchAll(
        /\.with\s*\(\s*(?:[A-Za-z_$][\w$]*\s*\(|attach(?:Loader|Plugins|Devtools)\b)/g,
      )) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "`.with(...)` composition is gone (0.5.0) and 0.8 has no composition verb at all: pass " +
      "`loader` and `plugins` to createI18n.",
  },
  {
    id: "banned/removed-svelte-api",
    migration:
      "MIGRATION.md §3 (`@comvi/svelte`: allowedTags removed, createLanguageStore removed)",
    find(text) {
      const matches = [];
      for (const match of text.matchAll(/\ballowedTags\b|\bcreateLanguageStore\b/g)) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "removed in 0.5.0: `<T>` renders structurally and tag handlers come from `components`, " +
      "and createLanguageStore is replaced by createLocaleStore.",
  },
  {
    id: "banned/devtools-options-on-constructor",
    migration: ".changeset/core-08-editor-seams.md (`devtools()`, no options)",
    find(text) {
      if (!/\bcreateI18n\s*\(|\bdevtools\s*\(/.test(text)) return [];
      const matches = [];
      // Lookbehind rather than a consumed leading character: consuming it put
      // the reported column one to the left of the symbol.
      for (const match of text.matchAll(
        /(?<![\w.$])(exposeGlobal|instanceId|editorVersion)\s*:/g,
      )) {
        matches.push({ index: match.index, text: match[1] });
      }
      return matches;
    },
    message:
      "removed in 0.8: discovery is `plugins: [devtools()]` and devtools() takes no options — " +
      "exposeGlobal, instanceId and editorVersion are gone, the extension picks the editor version.",
  },
];

/**
 * Claims in English that stopped being true. Each is anchored on a present-tense
 * assertion, so MIGRATION.md's own past-tense narration of the same change
 * ("`clearMessages(undefined, ns)` also DEACTIVATED the namespace") does not
 * trip its own rule.
 */
const PROSE_RULES = [
  {
    id: "prose/register-loader-is-core-method",
    migration: "MIGRATION.md §0 (loader row) and §3; .changeset/core-08-instance.md",
    pattern: /registerLoader[^\n]{0,60}\bis (?:a|an) (?:method|member)\b/i,
    message:
      "false in 0.8: registerLoader is not a member of the instance — the loader is the " +
      "`loader` option of createI18n.",
  },
  {
    id: "prose/capability-member-on-core",
    migration: "MIGRATION.md §1 and §2; .changeset/core-08-instance.md",
    pattern:
      /(?:reloadMessages|addActiveNamespace|onMissingKey|onLoadError)[^\n]{0,80}\bis (?:a|an) (?:method|member)\b/i,
    message:
      "false in 0.8: the instance has twelve members and none of these — `load(ns)` loads " +
      "and retries, the `onError` and `missing` options report.",
  },
  {
    id: "prose/capability-member-from-use-i18n",
    migration: "MIGRATION.md §1 and §2 (the migration table); .changeset/core-08-instance.md",
    pattern:
      /\b(?:reloadMessages|addActiveNamespaces?|onMissingKey|onLoadError)\b[^\n]{0,80}\bfrom\s+`?useI18n\(\)/i,
    message:
      "false in 0.8: no useI18n() returns loader or plugin members — `load(ns)` is on the " +
      "instance, and the `onError` and `missing` options report.",
  },
  {
    id: "prose/use-i18n-returns-capability",
    migration: "MIGRATION.md §1 and §2 (the migration table); .changeset/core-08-instance.md",
    pattern:
      /useI18n\(\)[^\n]{0,120}\b(?:returns?|provides?|includes?|exposes?)\b[^\n]{0,120}\b(?:reloadMessages|addActiveNamespaces?|onMissingKey|onLoadError)\b/i,
    message:
      "false in 0.8: no useI18n() returns loader or plugin members — `load(ns)` is on the " +
      "instance, and the `onError` and `missing` options report.",
  },
  {
    id: "prose/clear-messages-deactivates",
    migration:
      "MIGRATION.md §7 (clearMessages clears content, never intent); .changeset/core-08-instance.md",
    pattern: /clearMessages[^\n]{0,100}\b(?:deactivates|stops serving|removes the namespace)\b/i,
    message: "false in 0.8: the instance has no clearMessages(); `add()` patches a catalog.",
  },
];

/**
 * A table row is the only place this rule looks for a size figure.
 *
 * Narrow on purpose. A README talks about bytes in three registers, and only one
 * of them is a measurement a reader can check: `~5 kB base host` is a rounded
 * claim, `+93 B (+1.47%)` is a delta against a graph that no longer exists, and
 * `` | `fw-react-default` | **6902 B** | `` is a row of `scripts/size-budgets.json`
 * transcribed by hand. The third is the one that rots, because the baseline
 * moves on a re-sweep and the README does not, and it is the only one with an
 * unambiguous right answer. Anchoring on `|` is what keeps the other two out.
 */
const SIZE_TABLE_ROW = /^\s*\|/;

/** A fixture name in backticks: the row's claim about WHICH measurement it quotes. */
const SIZE_FIXTURE_NAME = /`([A-Za-z0-9][\w-]*)`/g;

/**
 * A byte figure in a CELL of such a row: `6902 B`, `6,902 B`, `**6902 B**`, `**7240**`.
 *
 * The unit is optional, because half a size table writes `**6902 B**` and half
 * writes `**7240**` under a column headed `min+gz`, and both were transcribed
 * from the same file. A rule that read only the suffixed form greened four stale
 * rows while reporting four others, which is how this rule was first written.
 *
 * What keeps the unit-less form from grading every number on the row is the
 * CELL, not a lookaround. A figure is graded only when its cell holds nothing
 * else — emphasis and spaces aside — because that is what a measurement column
 * looks like and it is not what anything else on these rows looks like:
 *
 *     | base | `fw-react-default` | **6902 B** |          -> graded (6902)
 *     | base | `fw-react-default` | measured 2026-09-12 | -> not a figure cell
 *     | base | `fw-react-default` | see PR #1234 |        -> not a figure cell
 *     | base | `fw-react-default` | node 2024 |           -> not a figure cell
 *
 * The last three were FALSE POSITIVES in the committed rule, which excluded only
 * a signed number and figures under four digits. Four digits does keep a
 * percentage and a multiplier out, but a date, an issue number and a year are
 * all four digits, and `scripts/size-budgets.json` records a `measuredAt` per
 * fixture — so a `measured` column on one of these tables was one edit away from
 * firing the gate on a correct page, which the note below calls the way a rule
 * gets disabled. Excluding an ISO date and a `#` prefix would have left
 * `see PR 1234` firing; the cell rule closes the class rather than three of its
 * members.
 *
 * A SIGNED figure is excluded even alone in its cell: `+233 B` is a difference
 * between two sweeps rather than the fixture's size, and grading it would report
 * every honest delta as stale. `kB` is excluded by construction — a unit, when
 * present, must be `B` alone.
 */
const SIZE_FIGURE_CELL = new RegExp(
  String.raw`^[*_ \u00a0\u202f]*(\d{1,3}(?:[, \u00a0\u202f]\d{3})+|\d{4,})` +
    String.raw`[ \u00a0\u202f]*B?[*_ \u00a0\u202f]*$`,
);

/** A leading sign anywhere in the cell means the number is a delta, not a size. */
const SIZE_SIGNED = /[-+]\s*\d/;

/** The grouping separators a thousands-grouped figure may use. */
const SIZE_SEPARATORS = new RegExp(String.raw`[, \u00a0\u202f]`, "g");

/**
 * Stale size figures on one line, against the recorded baselines.
 *
 * A figure is accepted when it equals ANY number the baseline records for that
 * fixture — `minBytes`, `gzipBytes` or `gzipBudgetBytes`. Which column a README
 * chose to quote is the README's business; whether the number is one the repo
 * measured is not. Demanding `gzipBytes` specifically would have made a correct
 * budget column a finding, and a rule that fires on a correct page is a rule
 * people disable.
 *
 * `baselines` is a `Map<name, { minBytes, gzipBytes, gzipBudgetBytes }>`. A
 * backticked token that names no fixture is ignored: `` `<T>` `` and
 * `` `@comvi/react` `` sit in these rows too.
 */
export function staleSizeFigures(text, baselines) {
  if (!SIZE_TABLE_ROW.test(text)) return [];
  const named = [];
  for (const match of text.matchAll(SIZE_FIXTURE_NAME)) {
    const recorded = baselines.get(match[1]);
    if (recorded !== undefined) named.push({ name: match[1], recorded });
  }
  if (named.length === 0) return [];

  const findings = [];
  // Cells, not a global scan over the row: `|` is the only delimiter a markdown
  // row has, and the cell is what tells a measurement column from a prose one.
  let cursor = 0;
  for (const cell of text.split("|")) {
    const cellAt = cursor;
    cursor += cell.length + 1;
    if (SIZE_SIGNED.test(cell)) continue;
    const figure = SIZE_FIGURE_CELL.exec(cell);
    if (figure === null) continue;
    const stated = Number(figure[1].replace(SIZE_SEPARATORS, ""));
    // A row naming two fixtures cannot be graded: the figure belongs to one of
    // them and nothing in the text says which. Accepting a match against EITHER
    // is the only answer that never invents a finding.
    if (
      named.some(
        ({ recorded }) =>
          stated === recorded.gzipBytes ||
          stated === recorded.minBytes ||
          stated === recorded.gzipBudgetBytes,
      )
    ) {
      continue;
    }
    const expected = named
      .map(({ name, recorded }) => `${name}: ${recorded.gzipBytes} B min+gz`)
      .join(", ");
    findings.push({
      index: cellAt + cell.indexOf(figure[1]),
      stated,
      message:
        `this row states ${stated} B beside ${named.map(({ name }) => `\`${name}\``).join(" / ")}, ` +
        `but scripts/size-budgets.json records ${expected}. Re-read the baseline, or quote a ` +
        "different fixture — a README number nobody re-measures is the one readers trust most.",
    });
  }
  return findings;
}

/** Turn a match offset inside a fence's code into a source `{ line, col }`. */
function locate(lines, offset) {
  let consumed = 0;
  for (const line of lines) {
    const end = consumed + line.text.length;
    if (offset <= end) {
      return { line: line.srcLine, col: line.srcCol + (offset - consumed) };
    }
    consumed = end + 1;
  }
  const last = lines.at(-1);
  return { line: last?.srcLine ?? 1, col: last?.srcCol ?? 1 };
}

/**
 * Lint one document.
 *
 * `surface` is the repo's `@comvi/*` package surface, from
 * `loadRepoSurface()`. It is OPTIONAL, and the omission is the contract:
 * `banned/unresolved-comvi-import` is the only rule that needs the filesystem,
 * and without it the lint stays the pure text function every other rule is
 * written against — which is also what keeps the www copy, where there is no
 * `packages/` tree, reporting the D2a findings and nothing invented.
 *
 * `sizeBaselines` is optional for the same reason and with the same contract:
 * `prose/stale-size-figure` is the only rule that needs to know what the repo
 * measured, and `scripts/size-budgets.json` exists in js-sdk and nowhere else.
 * Without the map the rule answers nothing — never everything — so the www copy
 * keeps reporting exactly the findings it can prove.
 *
 * @param {{ file: string, source: string, sdkVersion?: string, surface?: object, sizeBaselines?: Map<string, object> }} input
 * @returns {{ findings: Array<object>, stats: object }}
 */
export function lintDocument({ file, source, sdkVersion, surface, sizeBaselines }) {
  const findings = [];
  const { fences, errors } = extractFences(source, file);
  const frontmatter = parseFrontmatter(source);
  const classes = classify(file);
  const skips = {};
  let linted = 0;

  for (const error of errors) {
    findings.push({
      file,
      line: error.line,
      col: error.col,
      rule: "extract/malformed",
      message: error.message,
      migration: null,
    });
  }

  fences.forEach((fence) => {
    const category = skipCategory(fence);
    if (category !== null) {
      skips[category] = (skips[category] ?? 0) + 1;
      if (fence.check.skip && !fence.check.skipReason) {
        findings.push({
          file,
          line: fence.line,
          col: fence.col,
          rule: "meta/skip-without-reason",
          message: "check=skip needs a reason slug, as in check=skip:competitor-example.",
          migration: null,
        });
      }
      return;
    }

    if (!CODE_LANGS.has(fence.lang)) return;
    linted += 1;

    // MIGRATION.md is written in TypeScript throughout, and vue-tsc / svelte-check
    // type nothing in a `<script>` without lang="ts": a green run over an untyped
    // SFC fence is a green run over nothing at all (docs-0.5 plan §6.1.5).
    if (SFC_LANGS.has(fence.lang) && !fence.check.js) {
      for (const line of fence.lines) {
        const script = line.text.match(/<script\b([^>]*)>/);
        if (!script) continue;
        if (/\blang\s*=\s*["']ts["']/.test(script[1])) continue;
        findings.push({
          file,
          line: line.srcLine,
          col: line.srcCol + script.index,
          rule: "fence/untyped-sfc",
          message:
            `a ${fence.lang} <script> without lang="ts" is invisible to vue-tsc / svelte-check. ` +
            'Add lang="ts", or mark the fence check=js to say the JS is deliberate.',
          migration: null,
        });
      }
    }

    const lines = codeLines(fence);
    const text = lines.map((line) => line.text).join("\n");

    for (const rule of BANNED_RULES) {
      for (const match of rule.find(text, { surface })) {
        const at = locate(lines, match.index);
        findings.push({
          file,
          line: at.line,
          col: at.col,
          rule: rule.id,
          // A match may span lines (`\n  .use(\n  fetchLoaderPlugin(`); the report is
          // one line per finding, so the quoted symbol is flattened.
          //
          // `match.message` overrides the rule's: an import-resolution finding
          // says which name is missing from which entry and where it moved to,
          // and that fact is per MATCH, not per rule.
          message: `${match.text.replace(/\s+/g, " ").trim()} — ${match.message ?? rule.message}`,
          migration: rule.migration,
        });
      }
    }
  });

  for (const line of extractProse(source, file)) {
    for (const rule of PROSE_RULES) {
      const match = line.text.match(rule.pattern);
      if (!match) continue;
      findings.push({
        file,
        line: line.srcLine,
        col: match.index + 1,
        rule: rule.id,
        message: rule.message,
        migration: rule.migration,
      });
    }

    // Prose, not a fence, and deliberately so: the figure a reader checks is in
    // a markdown table, which no compiler and no fence rule will ever read.
    if (sizeBaselines === undefined) continue;
    for (const stale of staleSizeFigures(line.text, sizeBaselines)) {
      findings.push({
        file,
        line: line.srcLine,
        col: stale.index + 1,
        rule: "prose/stale-size-figure",
        message: stale.message,
        migration: "scripts/size-budgets.json (the recorded baseline) and scripts/size-budgets.md",
      });
    }
  }

  // REQUIRED — what the page must say, which no type-checker can ever notice.
  // Since 0.8 only the API pages' version stamp is left: the two 0.7
  // requirements (`.use(installer)` on a framework page, `compiler: icuCompiler`
  // beside an ICU catalog) asked for API that 0.8 removed, and are banned above.
  if (classes.has("api")) {
    const stamp = readVersionStamp(source, frontmatter);
    if (!stamp) {
      findings.push({
        file,
        line: 1,
        col: 1,
        rule: "required/version-stamp",
        message:
          "an API page needs a version stamp — `Verified against `@comvi/<pkg>@<version>`` in the " +
          'body, or `verified: "@comvi/<pkg>@<version>"` in the frontmatter.',
        migration: null,
      });
    } else if (sdkVersion && stamp.version !== sdkVersion) {
      findings.push({
        file,
        line: stamp.line,
        col: stamp.col,
        rule: "required/version-stamp",
        message: `stamped against @comvi/${stamp.pkg}@${stamp.version}, but this run checks ${sdkVersion}.`,
        migration: null,
      });
    }
  }

  return {
    findings,
    stats: {
      file,
      classes: [...classes],
      fences: fences.length,
      linted,
      skips,
      registerLoaderCalls: countRegisterLoaderCalls(fences),
      // Prose mentions too: `namespaces.mdx` and `vanilla.mdx` describe
      // `registerLoader` in a sentence and a table without ever calling it, and
      // whoever rewrites those pages still has to read them.
      registerLoaderMentions: [...source.matchAll(/\bregisterLoader\b/g)].length,
    },
  };
}

/** `Verified against \`@comvi/react@0.5.0\`` in the body, or a frontmatter key. */
function readVersionStamp(source, frontmatter) {
  const fromFrontmatter = frontmatter.verified ?? frontmatter.verifiedAgainst;
  if (fromFrontmatter) {
    const parsed = fromFrontmatter.match(/@comvi\/([a-z-]+)@([^\s`"']+)/);
    if (parsed) return { pkg: parsed[1], version: parsed[2], line: 1, col: 1 };
  }
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/Verified against\s+`@comvi\/([a-z-]+)@([^`]+)`/i);
    if (match) return { pkg: match[1], version: match[2], line: index + 1, col: match.index + 1 };
  }
  return null;
}

/**
 * Every `x.registerLoader(` call site in a document. The gate reports this
 * beside the findings because a rewrite budget is measured in call sites, not
 * in errors.
 */
function countRegisterLoaderCalls(fences) {
  let count = 0;
  for (const fence of fences) {
    if (!CODE_LANGS.has(fence.lang)) continue;
    for (const line of codeLines(fence)) {
      // The same receiver shapes the rule counts as findings — a budget that
      // cannot see `getI18n().registerLoader(fn)` is not a budget.
      count += [...line.text.matchAll(REGISTER_LOADER_CALL)].length;
    }
  }
  return count;
}

export { BANNED_RULES, PROSE_RULES, CODE_LANGS, skipCategory };
