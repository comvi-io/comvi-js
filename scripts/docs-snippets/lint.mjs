/**
 * Symbol-lint for the docs snippet gate (lot D2a).
 *
 * A type-checker can only fail on API that is PRESENT and wrong. The drift these
 * two doc surfaces actually suffered is the other kind: `.with(` appears zero
 * times across ~40 site pages, and no compiler will ever notice an API that was
 * never written. Prose is worse still — `react.mdx:39` states that
 * `registerLoader()` is a method on the core instance, which stopped being true
 * in 0.5.0 and compiles under nothing. So this file lints SYMBOLS: what must not
 * appear, what must appear, and what the page claims in English.
 *
 * Every BANNED and REQUIRED rule below is derived from `MIGRATION.md` and cites
 * the section it comes from, in the rule and in the message a reader sees. No
 * rule states an API fact that MIGRATION.md does not.
 *
 * Scope rule that matters: a capability is acquired PER CHAIN, not per page.
 * MIGRATION.md §3 makes the chain the unit for the codemod, and the same unit is
 * used here. A page-wide scope would clear `ssr.mdx`'s `defineComviSetup`
 * snippet because an unrelated `createNextI18n(` sits 180 lines above it.
 *
 * The chain is: the fence itself; every fence carrying the same explicit
 * `check=group=<id>`; and, for a bare `title=`, only fences with that title in
 * the SAME `<TabItem>` body. A bare title alone is not a chain — `quick-start.mdx`
 * writes `src/i18n.ts` eight times, once per framework tab, and pooling them let
 * the React tab's `.with(loader())` vouch for the Vue tab's `registerLoader`.
 * `title=` is a virtual file name (docs-0.5 plan §6.2); a virtual file name is
 * only unique inside one virtual project, and the tab is that project.
 *
 * Acquisition evidence is read from code with comments and string literals
 * stripped, because `// Wrong: you must write .with(loader()) first` is a
 * sentence about the fix, not the fix.
 */

import path from "node:path";
import { extractFences, extractProse, parseFrontmatter } from "./extract.mjs";

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

/** Fence languages that can hold a translation catalog. */
const CATALOG_LANGS = new Set(["json", "jsonc", "json5", "yaml"]);

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

/** Tokens proving the chain already has the loader capability. */
const LOADER_TOKENS = [
  /\.with\(\s*loader\s*\(/,
  /\.with\(\s*attachLoader\b/,
  /\battachLoader\s*\(/,
  /\.with\(\s*fetchLoader\s*\(/,
  /\.with\(\s*cdnLoader\s*\(/,
  // MIGRATION.md §6: `createNextI18n` is preserved exactly and composes the
  // loader with both `registerLoader` overloads inside the package; its host
  // type `NextComposedI18n` and the SSR `NextServerLoaderHost` carry it too.
  /\bcreateNextI18n\s*\(/,
  /\bNextComposedI18n\b/,
  /\bNextServerLoaderHost\b/,
  // MIGRATION.md §7: a nuxt hook annotated with the host its factory returns
  // (`NuxtI18nSetup<I18n & I18nLoaderApi>`) fails at type-check rather than at
  // request time, so the annotation IS the proof the host composed the loader.
  /\bI18nLoaderApi\b/,
  /\bNuxtServerLoaderHost\b/,
];

/** Tokens proving the chain already has the plugin capability. */
const PLUGIN_TOKENS = [
  /\.with\(\s*plugins\s*\(/,
  /\.with\(\s*attachPlugins\b/,
  /\battachPlugins\s*\(/,
  /\.with\(\s*(?:fetchLoader|cdnLoader|localeDetector|inContextEditor)\s*\(/,
  /\bcreateNextI18n\s*\(/,
];

/** Tokens proving the page picked a compiler explicitly (MIGRATION.md §0.1). */
const ICU_TOKENS = [/\bicuCompiler\b/, /@comvi\/core\/icu/, /\.with\(\s*icu\s*\(/];

/** An ICU argument in a catalog string: `{count, plural, …}` (MIGRATION.md §0). */
const ICU_SYNTAX = /\{\s*\w+\s*,\s*(?:plural|selectordinal|select)\s*,/;

/**
 * Pages that must show capability composition. A framework page or the
 * quick-start that never writes `.with(` is documenting the 0.4 host
 * (MIGRATION.md §4, "`.with(installer)` — composing a capability").
 */
const FRAMEWORK_BASENAMES = new Set([
  "quick-start",
  "react",
  "vue",
  "svelte",
  "solid",
  "next",
  "nuxt",
  "vanilla",
]);

/** README basenames (the package directory) held to the same requirement. */
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

  if (base === "README" || base === "MIGRATION") {
    // Both layouts name the same package: `packages/cli/README.md` in this repo,
    // `node_modules/@comvi/cli/README.md` once www checks the published copies.
    // Matching only the first made every non-framework package's INSTALLED
    // README owe a `.with(` its own source is rightly not asked for.
    const pkg = posix.match(/(?:packages|@comvi)\/([^/]+)\/README\.md$/)?.[1];
    if (base === "MIGRATION" || pkg === undefined || FRAMEWORK_PACKAGES.has(pkg)) {
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

/** Does any token match this text? */
function hasAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

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

/**
 * The group key a fence shares with the fences it composes with.
 *
 * `check=group=<id>` is explicit and pools document-wide — that is what it is
 * for. A bare `title=` pools only within one `<TabItem>` body, because the same
 * virtual file name in two tabs is two different apps.
 */
function groupKey(fence, index) {
  if (fence.check.group) return `group:${fence.check.group}`;
  if (fence.title) return `title:${fence.container ?? 0}:${fence.title}`;
  return `fence:${index}`;
}

/**
 * Code with line comments, block comments and HTML comments removed, and — when
 * `strings` is set — string literals emptied too.
 *
 * Acquisition evidence has to be evidence. A page that writes
 * `// don't forget .with(loader())` above a bare `registerLoader` is describing
 * the bug, and reading the comment as the fix silences the one rule that would
 * have caught it. Strings go the same way for the chain check, where a token
 * quoted in a message is not a call. They are KEPT for the REQUIRED probes,
 * because there the evidence is often a specifier — `@comvi/core/icu` only ever
 * appears inside quotes. Template literals keep their `${…}` substitutions
 * either way: those are real code.
 */
function stripNonCode(code, { strings }) {
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
    if (code.startsWith("<!--", index)) {
      const end = code.indexOf("-->", index + 4);
      index = end === -1 ? code.length : end + 3;
      continue;
    }
    const char = code[index];
    if (strings && (char === '"' || char === "'" || char === "`")) {
      index += 1;
      let depth = 0;
      while (index < code.length) {
        const inner = code[index];
        if (inner === "\\") {
          index += 2;
          continue;
        }
        if (char === "`" && code.startsWith("${", index)) {
          depth += 1;
          out += "${";
          index += 2;
          continue;
        }
        if (char === "`" && depth > 0 && inner === "}") {
          depth -= 1;
          out += "}";
          index += 1;
          continue;
        }
        if (depth === 0 && inner === char) {
          index += 1;
          break;
        }
        if (depth > 0) out += inner;
        index += 1;
      }
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** Comments and string literals removed — the form the chain check reads. */
export function stripCommentsAndStrings(code) {
  return stripNonCode(code, { strings: true });
}

/** Comments removed, strings kept — the form the REQUIRED probes read. */
export function stripComments(code) {
  return stripNonCode(code, { strings: false });
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
 * Banned code patterns. `scope` is `"chain"` when an acquisition token in the
 * same chain clears the finding, and `"always"` when the symbol is simply gone
 * from 0.5.0 and nothing can clear it.
 */
const BANNED_RULES = [
  {
    id: "banned/register-loader-on-instance",
    migration: "MIGRATION.md §0 (loader row) and §4 `.with(installer)`",
    scope: "chain",
    capability: "loader",
    find(text) {
      const matches = [];
      // `.core` is where the call MOVED (MIGRATION.md §2, §7), not proof the
      // host can serve it: `createI18n` from `@comvi/vue` wraps a BASE core
      // (packages/vue/src/createI18n.ts), so `i18n.core.registerLoader(fn)` on
      // an uncomposed wrapper throws exactly like the 0.4 call it replaced.
      // The receiver is therefore not exempt — only the chain can clear it.
      for (const match of text.matchAll(
        /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.registerLoader\s*\(/g,
      )) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "registerLoader() is not on the 0.5.0 base host. Compose the capability in the same chain — " +
      ".with(loader(map)) or .with(attachLoader), or createCore(…).with(loader()) under a VueI18n.",
  },
  {
    id: "banned/plugin-use-without-plugins",
    migration: "MIGRATION.md §0 (`.use(plugin)` row) and §5",
    scope: "chain",
    capability: "plugins",
    find(text) {
      const matches = [];
      // `i18n.core.use(…)` is where the call moved (MIGRATION.md §2, §4), and
      // the host it moved to is still the base one unless something composed
      // `plugins()`. Same reasoning as registerLoader: no receiver exemption.
      const re = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)?\.use\s*\(\s*[A-Z][\w$]*\s*[(,)]/g;
      for (const match of text.matchAll(re)) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "`.use(Plugin())` needs the plugin capability, absent from the 0.5.0 base host. " +
      "Compose .with(plugins()) in the same chain, or use the lowercase installer with .with().",
  },
  {
    id: "banned/slim-entry",
    migration: "MIGRATION.md §3 (codemod table: `@comvi/<pkg>/slim` and `createSlimI18n`)",
    scope: "always",
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
    id: "banned/installer-in-plugin-slot",
    migration: "MIGRATION.md §5 and §8 (`E_INSTALLER_NESTED_USE`)",
    scope: "always",
    find(text) {
      const matches = [];
      const re =
        /\.use\s*\(\s*(fetchLoader|cdnLoader|localeDetector|inContextEditor|loader|plugins|devtools|icu)\s*\(/g;
      for (const match of text.matchAll(re)) matches.push({ index: match.index, text: match[0] });
      return matches;
    },
    message:
      "an installer goes in the .with() slot, not .use(): this throws E_INSTALLER_NESTED_USE at init().",
  },
  {
    id: "banned/removed-svelte-api",
    migration:
      "MIGRATION.md §4 (`@comvi/svelte`: allowedTags removed, createLanguageStore removed)",
    scope: "always",
    find(text) {
      const matches = [];
      for (const match of text.matchAll(/\ballowedTags\b|\bcreateLanguageStore\b/g)) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "removed in 0.5.0: `<T>` renders structurally so allowedTags is a type error, " +
      "and createLanguageStore is replaced by createLocaleStore.",
  },
  {
    id: "banned/devtools-options-on-constructor",
    migration: "MIGRATION.md §3 (codemod table: `exposeGlobal` / `instanceId` options) and §0.3",
    scope: "always",
    find(text) {
      if (!/\bcreateI18n\s*\(|\bnew I18n\s*\(|\bcreateCore\s*\(/.test(text)) return [];
      if (/\bdevtools\s*\(/.test(text)) return [];
      const matches = [];
      // Lookbehind rather than a consumed leading character: consuming it put
      // the reported column one to the left of the symbol.
      for (const match of text.matchAll(/(?<![\w.$])(exposeGlobal|instanceId)\s*:/g)) {
        matches.push({ index: match.index, text: match[1] });
      }
      return matches;
    },
    message:
      "discovery is opt-in in 0.5.0: exposeGlobal / instanceId moved off the constructor " +
      "into .with(devtools({ … })).",
  },
];

/**
 * Claims in English that stopped being true. Each is anchored on a present-tense
 * assertion, so MIGRATION.md's own past-tense narration of the same change
 * ("`clearTranslations(undefined, ns)` also DEACTIVATED the namespace") does not
 * trip its own rule.
 */
const PROSE_RULES = [
  {
    id: "prose/register-loader-is-core-method",
    migration: "MIGRATION.md §0 (loader row) and §4",
    pattern: /registerLoader[^\n]{0,60}\bis (?:a|an) (?:method|member)\b/i,
    message:
      "false since 0.5.0: registerLoader is not a member of the base host — it arrives with " +
      ".with(loader()) / attachLoader.",
  },
  {
    id: "prose/capability-member-on-core",
    migration: "MIGRATION.md §1 and §2",
    pattern:
      /(?:reloadTranslations|addActiveNamespace|onMissingKey|onLoadError)[^\n]{0,80}\bis (?:a|an) (?:method|member)\b/i,
    message:
      "false since 0.5.0: the loader and plugin members are not on the base host — they come " +
      "from useI18nLoader() / useI18nPlugins().",
  },
  {
    id: "prose/capability-member-from-use-i18n",
    migration: "MIGRATION.md §1 and §2 (the migration table)",
    pattern:
      /\b(?:reloadTranslations|addActiveNamespaces?|onMissingKey|onLoadError)\b[^\n]{0,80}\bfrom\s+`?useI18n\(\)/i,
    message:
      "useI18n() no longer returns loader or plugin members in 0.5.0 — use useI18nLoader() " +
      "or useI18nPlugins().",
  },
  {
    id: "prose/use-i18n-returns-capability",
    migration: "MIGRATION.md §1 and §2 (the migration table)",
    pattern:
      /useI18n\(\)[^\n]{0,120}\b(?:returns?|provides?|includes?|exposes?)\b[^\n]{0,120}\b(?:reloadTranslations|addActiveNamespaces?|onMissingKey|onLoadError)\b/i,
    message:
      "useI18n() no longer returns loader or plugin members in 0.5.0 — use useI18nLoader() " +
      "or useI18nPlugins().",
  },
  {
    id: "prose/clear-translations-deactivates",
    migration: "MIGRATION.md §8 (clearTranslations clears content, never intent)",
    pattern:
      /clearTranslations[^\n]{0,100}\b(?:deactivates|stops serving|removes the namespace)\b/i,
    message:
      "since 0.5.0 clearTranslations() clears CONTENT only — deactivation moved to " +
      "removeActiveNamespace(ns) on the loader capability.",
  },
];

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
 * @param {{ file: string, source: string, sdkVersion?: string }} input
 * @returns {{ findings: Array<object>, stats: object }}
 */
export function lintDocument({ file, source, sdkVersion }) {
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

  // Chain scope: every fence sharing a group key pools its acquisition tokens,
  // read from code with comments and string literals stripped.
  const chainText = new Map();
  fences.forEach((fence, index) => {
    if (!CODE_LANGS.has(fence.lang)) return;
    const key = groupKey(fence, index);
    const code = stripCommentsAndStrings(
      codeLines(fence)
        .map((line) => line.text)
        .join("\n"),
    );
    chainText.set(key, (chainText.get(key) ?? "") + "\n" + code);
  });

  fences.forEach((fence, index) => {
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
    const chain = chainText.get(groupKey(fence, index)) ?? stripCommentsAndStrings(text);

    for (const rule of BANNED_RULES) {
      if (rule.scope === "chain") {
        const tokens = rule.capability === "loader" ? LOADER_TOKENS : PLUGIN_TOKENS;
        if (hasAny(tokens, chain)) continue;
      }
      for (const match of rule.find(text)) {
        const at = locate(lines, match.index);
        findings.push({
          file,
          line: at.line,
          col: at.col,
          rule: rule.id,
          // A match may span lines (`\n  .use(\n  FetchLoader(`); the report is
          // one line per finding, so the quoted symbol is flattened.
          message: `${match.text.replace(/\s+/g, " ").trim()} — ${rule.message}`,
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
  }

  // REQUIRED — what the page must say, which no type-checker can ever notice.
  // Read from the LINTED FENCES, never from `source`: a `.with(` in a prose
  // sentence, a comparison table or a `check=skip` competitor block is not code
  // the reader can run, and one migrated tab must not green a page of 0.4 tabs.
  // Catalogs are usually JSON, so the ICU probe reads every fence that can hold
  // a message, not just the ones written in TypeScript.
  const catalogFences = fences.filter(
    (fence) =>
      (CODE_LANGS.has(fence.lang) || CATALOG_LANGS.has(fence.lang)) && skipCategory(fence) === null,
  );
  const lintedCode = fences
    .filter((fence) => CODE_LANGS.has(fence.lang) && skipCategory(fence) === null)
    .map((fence) =>
      stripComments(
        codeLines(fence)
          .map((line) => line.text)
          .join("\n"),
      ),
    )
    .join("\n");

  // The ICU requirement asks whether the PAGE warns its reader that the default
  // compiler will not render the argument it just showed — a page-level claim
  // with one answer per host, so a prose sentence is evidence and `.with(` is
  // not the point. What must never count is a `check=skip` fence: a competitor
  // block quoting `icuCompiler` would otherwise vouch for the whole page.
  const skippedLines = new Set();
  for (const fence of fences) {
    if (skipCategory(fence) === null) continue;
    for (let line = fence.line; line <= fence.endLine; line += 1) skippedLines.add(line);
  }
  const icuEvidence = source
    .split("\n")
    .filter((_, index) => !skippedLines.has(index + 1))
    .join("\n");

  if (classes.has("framework") && !/\.with\s*\(/.test(lintedCode)) {
    findings.push({
      file,
      line: 1,
      col: 1,
      rule: "required/with-composition",
      message:
        "a framework page or quick-start whose code never writes `.with(` documents the 0.4 " +
        "batteries-included host. Show how the page's capability is composed, in a fence.",
      migration: "MIGRATION.md §4 `.with(installer)` — composing a capability",
    });
  }

  const icuHit = catalogFences
    .flatMap((fence) => codeLines(fence))
    .find((line) => ICU_SYNTAX.test(line.text));
  if (icuHit && !hasAny(ICU_TOKENS, icuEvidence)) {
    const hit = icuHit;
    findings.push({
      file,
      line: hit?.srcLine ?? 1,
      col: hit?.srcCol ?? 1,
      rule: "required/icu-compiler",
      message:
        "this page shows an ICU argument, and the 0.5.0 default compiler does not render it: " +
        "dev throws at ingestion, production renders the braces literally. Name `icuCompiler` " +
        "(inline catalogs) or `.with(icu())` from @comvi/core/icu (remote catalogs).",
      migration: "MIGRATION.md §0 (ICU row) and §0.1 (the compiler has a timing rule)",
    });
  }

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
      // Same definition the requirement uses: `.with(` in a table or a sentence
      // is not code a reader can run.
      hasWith: /\.with\s*\(/.test(lintedCode),
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
 * Every `x.registerLoader(` call site in a document, exempt or not. The gate
 * reports this beside the findings because the D3–D5 rewrite budget is measured
 * in call sites, not in errors: a call the chain scope clears still has to be
 * read by whoever rewrites the page.
 */
function countRegisterLoaderCalls(fences) {
  let count = 0;
  for (const fence of fences) {
    if (!CODE_LANGS.has(fence.lang)) continue;
    for (const line of codeLines(fence)) {
      count += [...line.text.matchAll(/[A-Za-z_$][\w$.]*\.registerLoader\s*\(/g)].length;
    }
  }
  return count;
}

export { BANNED_RULES, PROSE_RULES, CODE_LANGS, skipCategory };
