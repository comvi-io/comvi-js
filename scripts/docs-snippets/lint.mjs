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
 * Every BANNED and REQUIRED rule below is derived from `MIGRATION.md` and cites
 * the section it comes from, in the rule and in the message a reader sees. No
 * rule states an API fact that MIGRATION.md does not. That document was retired
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
 * Scope rule that matters: a capability is acquired PER CHAIN, not per page.
 * MIGRATION.md §3 makes the chain the unit — `createI18n(…)` plus the `.use`
 * calls chained onto it — and the same unit is used here. A page-wide scope
 * would clear `ssr.mdx`'s `defineComviSetup` snippet because an unrelated
 * `createNextI18n(` sits 180 lines above it.
 *
 * The chain is: the fence itself; every fence carrying the same explicit
 * `check=group=<id>`; and, for a bare `title=`, only fences with that title in
 * the SAME `<TabItem>` body. A bare title alone is not a chain — `quick-start.mdx`
 * writes `src/i18n.ts` eight times, once per framework tab, and pooling them let
 * the React tab's `.use(loader())` vouch for the Vue tab's `registerLoader`.
 * `title=` is a virtual file name (docs-0.5 plan §6.2); a virtual file name is
 * only unique inside one virtual project, and the tab is that project.
 *
 * Acquisition evidence is read from code with comments and string literals
 * stripped, because `// Wrong: you must write .use(loader()) first` is a
 * sentence about the fix, not the fix.
 *
 * One verb (decision E, 11.09.2026): `.use(installer)` composes, and `.with` is
 * gone from the API entirely. So `.use(` is what the REQUIRED rule asks for and
 * `.with(` is BANNED outright — with the care that Vue's `app.use(i18n)` and
 * Nuxt's `nuxtApp.use` are a different `use` on a different object and are not
 * ours to count (see `hasUseComposition`).
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
  // `\s*` after the verb everywhere, as in PLUGIN_TOKENS and USE_COMPOSITION
  // below: a chain broken across lines writes `.use(\n  loader(…)` and a
  // formatter may put a space in, and an anchoring that only accepted `.use(`
  // graded the same evidence differently from rule to rule.
  /\.use\s*\(\s*loader\s*\(/,
  /\.use\s*\(\s*attachLoader\b/,
  /\battachLoader\s*\(/,
  /\.use\s*\(\s*fetchLoader\s*\(/,
  /\.use\s*\(\s*cdnLoader\s*\(/,
  // MIGRATION.md §5: `createNextI18n` composes the loader with both
  // `registerLoader` overloads inside the package; its host type
  // `NextComposedI18n` and the SSR `NextServerLoaderHost` carry it too. The
  // COMPILER is not on that list any more — the factory lost its `icuCompiler`
  // default in wave 6 — and this token vouches for the loader only. ICU
  // evidence is `ICU_TOKENS`, which has never counted this name.
  /\bcreateNextI18n\s*\(/,
  /\bNextComposedI18n\b/,
  /\bNextServerLoaderHost\b/,
  // MIGRATION.md §6: a nuxt hook annotated with the host its factory returns
  // (`NuxtI18nSetup<I18n & I18nLoaderApi>`) fails at type-check rather than at
  // request time, so the annotation IS the proof the host composed the loader.
  //
  // Positional, not bare: the proof is the host type being an INTERSECTION that
  // includes the loader API, and every real use writes it that way (nuxt README
  // 203/213, next README 384/429). A bare name also appears where it proves the
  // opposite — `import type { I18nLoaderApi }` and
  // `Omit<I18nLoaderApi, "registerLoader">` name the API in order to talk about
  // a host that does NOT have it, and would have vouched for the very
  // `registerLoader` call the rule exists to catch.
  /&\s*I18nLoaderApi\b/,
  /[&:<]\s*NuxtServerLoaderHost\b/,
];

/**
 * Tokens proving the chain already has the plugin capability.
 *
 * `definePlugin(fn)` is in the list because that is what it IS: the installer
 * helper from `@comvi/core/plugins` composes the capability and then queues
 * `fn` (brief E §3), so a chain that writes `.use(definePlugin(fn))` has the
 * plugin API on its host exactly as `.use(plugins())` does. The two names are
 * deliberately unalike — `plugins()` takes the capability, `definePlugin(fn)`
 * takes a plugin — and the rule has to know both.
 *
 * `inContextEditor` is deliberately NOT here, and it is the one first-party
 * installer that is not. Its type is `<T extends I18n<any>>(i18n: T) => T` in
 * both entries — it widens NOTHING — and the production entry is a no-op, so a
 * chain that composes it has exactly the host it started with and still has no
 * `registerPlugin`. Counting it cleared the very finding this rule exists for.
 */
const PLUGIN_TOKENS = [
  /\.use\s*\(\s*plugins\s*\(/,
  /\.use\s*\(\s*definePlugin\s*\(/,
  /\.use\s*\(\s*attachPlugins\b/,
  /\battachPlugins\s*\(/,
  /\.use\s*\(\s*(?:fetchLoader|cdnLoader|localeDetector)\s*\(/,
  /\bcreateNextI18n\s*\(/,
];

/**
 * Tokens proving the page picked a compiler explicitly (MIGRATION.md §0.1).
 *
 * `.use(icu(` was evidence while the installer existed. It is not evidence any
 * more — the installer is gone, so a page that still writes it has named NO
 * compiler the reader can use, and counting it would green exactly the page
 * `banned/icu-installer` below exists to catch.
 */
const ICU_TOKENS = [/\bicuCompiler\b/, /@comvi\/core\/icu/];

/** The removed installer's imported name, `icuCompiler` deliberately excluded. */
const ICU_INSTALLER_IMPORT = /^\s*(?:type\s+)?(icu)(?![\w$])/;

/** An ICU argument in a catalog string: `{count, plural, …}` (MIGRATION.md §0). */
const ICU_SYNTAX = /\{\s*\w+\s*,\s*(?:plural|selectordinal|select)\s*,/;

/**
 * Pages that must show capability composition. A framework page or the
 * platform-connection page that never composes is documenting the 0.4 host
 * (MIGRATION.md §3, "`.use(installer)` — composing a capability").
 * `quick-start` is inline-only by design since the 2026-09 rewrite; the
 * `.use(cdnLoader())` step lives on `connect-comvi`.
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

/** Does any token match this text? */
function hasAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Receivers whose `.use(` is somebody else's verb. Vue's `app.use(i18n)` and
 * Nuxt's `nuxtApp.use` install a Vue plugin; they are not the comvi host's
 * composition and must never vouch for a page that never composes (brief E,
 * hard rule 4). Excluding the receiver is what lets `required/use-composition`
 * keep asking a Vue page for a real chain.
 */
const FOREIGN_USE_RECEIVERS = new Set(["app", "nuxtApp", "vueApp", "vue"]);

/**
 * Receivers whose `.use(` takes a RAW plugin on purpose and always did: Vue's
 * app and Nuxt's `nuxtApp.vueApp` install Vue plugins, Express-shaped `server` /
 * `router` install middleware, and `i18next.use(HttpBackend)` is a competitor's
 * own verb quoted in a comparison. None of them is the comvi host, so
 * `banned/raw-plugin-in-use-slot` must not fire on them: the finding would be
 * unclearable on a page that is correct, which is how a pinned baseline moves.
 */
const FOREIGN_PLUGIN_RECEIVERS = new Set([
  "app",
  "vueApp",
  "nuxtApp",
  "server",
  "router",
  "i18next",
]);

/**
 * Every installer the 0.5.0 surface publishes, by name. This list — not "any
 * lowercase call" — is what counts as composition evidence.
 *
 * The looser test was the bug: `createApp(App).use(createPinia()).use(i18n)`
 * satisfied `required/use-composition` on a page that composes nothing comvi at
 * all, because `createPinia()` is a lowercase call. A capability the reader can
 * copy has a NAME, and there are twelve of them.
 *
 * `flattenCatalog` is not here on purpose: it is a hand-flattening helper for
 * catalog DATA, never an installer and never an argument to `.use(`, so listing
 * it would only widen the pattern back towards "any lowercase call".
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
];

/**
 * `.use(` in the comvi composition sense.
 *
 * The argument must be an INSTALLER BY NAME: a call to one of
 * `INSTALLER_NAMES`, or a bare `attachLoader` / `attachPlugins` /
 * `attachDevtools` reference. `app.use(i18n)` fails on both halves — foreign
 * receiver, and an argument that is neither a named installer nor a call —
 * which is the whole reason the two verbs can share a name safely.
 *
 * The receiver is NOT captured here. A capture group in front of `\.use` is
 * optional by necessity — a chained `.use` has no identifier in front of it —
 * and an optional group that is undefined on every chained call is a denylist
 * that never runs. It is read separately, by `receiverTail`, which walks
 * backwards from the dot and so works on `nuxtApp.vueApp.use(` too.
 */
const USE_COMPOSITION = new RegExp(
  String.raw`\.use\s*\(\s*(?:(?:${INSTALLER_NAMES.join("|")})\s*\(|attach(?:Loader|Plugins|Devtools)\b)`,
  "g",
);

/**
 * The last identifier of the receiver immediately in front of a `.` at
 * `dotIndex`, or `""` when the receiver ends in a call or an index.
 *
 * `nuxtApp.vueApp.use(` gives `vueApp`, `i18n?.use(` gives `i18n`, and
 * `createApp(App).use(` gives `""`. The LAST segment is what the denylists
 * name, which is what makes "a receiver chain ending in `.vueApp`" a lookup
 * rather than a second pattern.
 */
function receiverTail(text, dotIndex) {
  let index = dotIndex - 1;
  const skipSpace = () => {
    while (index >= 0 && /\s/.test(text[index])) index -= 1;
  };
  skipSpace();
  if (index >= 0 && text[index] === "?") {
    index -= 1;
    skipSpace();
  }
  const end = index + 1;
  while (index >= 0 && /[\w$]/.test(text[index])) index -= 1;
  return text.slice(index + 1, end);
}

/** Does this code compose a capability with `.use(installer)`? */
export function hasUseComposition(text) {
  for (const match of text.matchAll(USE_COMPOSITION)) {
    if (!FOREIGN_USE_RECEIVERS.has(receiverTail(text, match.index))) return true;
  }
  return false;
}

/**
 * A receiver in front of a capability call, in the shapes a doc actually
 * writes. An IDENTIFIER CHAIN (`i18n`, `i18n.core`, `i18n?.core`) is the
 * common one, and the two others are the ones an identifier-only pattern made
 * invisible: a call result (`createI18n({…}).registerPlugin(fn)`,
 * `getI18n().registerPlugin(fn)`) and an element read
 * (`hosts[0].registerPlugin(fn)`). All three carry the same fact — a receiver
 * is present — and a BARE call is still exempt, because
 * `const { registerPlugin } = useI18nPlugins()` names a capability the page
 * already acquired.
 */
const CAPABILITY_RECEIVER = String.raw`(?:[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*|\)|\])`;

/** `<receiver>.<member>(` for a capability member, optional chaining included. */
function capabilityCallPattern(member) {
  return new RegExp(`${CAPABILITY_RECEIVER}\\s*\\??\\.\\s*${member}\\s*\\(`, "g");
}

const REGISTER_LOADER_CALL = capabilityCallPattern("registerLoader");
const REGISTER_PLUGIN_CALL = capabilityCallPattern("registerPlugin");

/**
 * The four first-party raw-plugin factories, BY NAME.
 *
 * Wave 6 renamed them from `FetchLoader` / `CdnLoader` / `LocaleDetector` /
 * `InContextEditorPlugin` — names that differed from their installers by letter
 * case alone — to the `*Plugin` suffix. That is better for a reader and worse
 * for this rule: the capital letter WAS the detector, so after the rename
 * `.use(fetchLoaderPlugin())` reads as a bare lowercase call and the pattern
 * below would have waved through the exact mistake the rule exists for.
 *
 * Listed by name rather than matched as a `*Plugin` suffix, and deliberately:
 * `nextPlugin(f, { runtime })` and `nextPluginLazy(…)` END in `Plugin` and are
 * the CORRECT argument to `.use` on a `createNextI18n` result, so a suffix rule
 * would report the next README's own recommended chain. A closed list cannot
 * grow a false positive; it can only go stale, and a fifth first-party plugin
 * package is a repo change with a test beside it.
 */
const RAW_PLUGIN_FACTORY_NAMES = [
  "cdnLoaderPlugin",
  "fetchLoaderPlugin",
  "localeDetectorPlugin",
  "inContextEditorPlugin",
];

/**
 * A raw plugin in the `.use(` slot, in every shape the text can PROVE.
 *
 * Five of them, and the fifth needs no naming convention at all: an inline
 * function or arrow cannot be an installer, because an installer widens the
 * host and returns it, so a literal function in the slot is a raw plugin by
 * construction. Three more are an app's OWN convention — an Uppercase callee —
 * reached directly, through `new`, or through a namespace (`pkg.MyPlugin()`).
 * The last is {@link RAW_PLUGIN_FACTORY_NAMES}, the first-party factories,
 * which no longer announce themselves with a capital.
 *
 * Any other bare lowercase call stays unmatched on purpose: it is
 * indistinguishable from an installer in the text, and the host's runtime
 * identity guard is what catches it.
 */
const RAW_PLUGIN_IN_USE_SLOT = new RegExp(
  String.raw`\.use\s*\(\s*(?:` +
    String.raw`new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*[A-Z][\w$]*\s*[(,)]` +
    String.raw`|(?:[A-Za-z_$][\w$]*\s*\.\s*)*(?:${RAW_PLUGIN_FACTORY_NAMES.join("|")})\s*[(,)]` +
    String.raw`|(?:[A-Za-z_$][\w$]*\s*\.\s*)+[A-Z][\w$]*\s*\(` +
    String.raw`|[A-Z][\w$]*\s*[(,)]` +
    String.raw`|(?:async\s*)?(?:\(|function\b)` +
    String.raw`)`,
  "g",
);

/** Bindings the fence assigns from `createNextI18n(…)`. */
function nextHostBindings(text) {
  const names = new Set();
  for (const match of text.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?createNextI18n\s*\(/g,
  )) {
    names.add(match[1]);
  }
  return names;
}

/**
 * The text of the STATEMENT a match sits in, back to the last `;` or blank
 * line.
 *
 * Not back to the last `{`: a chain's own options object
 * (`createNextI18n({ locale: "en" }).use(…)`) closes a brace between the root
 * and the call, so a brace boundary would cut the root off. The limit of the
 * heuristic, stated rather than hidden: a statement with no terminating `;` and
 * a blank line inside it reads as two.
 */
function statementAt(text, index) {
  const semicolon = text.lastIndexOf(";", index);
  const blank = text.lastIndexOf("\n\n", index);
  return text.slice(Math.max(semicolon + 1, blank + 1, 0), index);
}

/**
 * Is this `.use(` the `createNextI18n` compat surface?
 *
 * `createNextI18n` keeps every 0.4 capability (MIGRATION.md §5) and its
 * composed host keeps the raw plugin queue, so `result.use(RawPlugin())` on it
 * is a deliberate surviving shape rather than an `E_USE_NOT_INSTALLER` waiting
 * to happen. The factory's `compiler` default is gone, but that is a
 * constructor option and never affected this exemption. Proven two ways: the receiver is a binding the fence assigned from
 * `createNextI18n(…)`, or the statement the call sits in is a chain rooted
 * there.
 */
function isNextCompatUse(text, index, receiver, nextHosts) {
  if (receiver !== "" && nextHosts.has(receiver)) return true;
  return /\bcreateNextI18n\s*\(/.test(statementAt(text, index));
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
 * `// don't forget .use(loader())` above a bare `registerLoader` is describing
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
    if (char === '"' || char === "'" || char === "`") {
      // A quoted run is CONSUMED in both modes, and only the disposal differs.
      // Without this, `strings: false` walked into the literal character by
      // character and the `//` in
      // `createI18n({ baseUrl: "https://cdn.comvi.io/x" }).use(loader())`
      // read as a line comment, swallowing the `.use(loader())` behind it and
      // reporting a page that composes correctly as one that never composes.
      const start = index;
      index += 1;
      let depth = 0;
      let kept = "";
      let closed = false;
      while (index < code.length) {
        const inner = code[index];
        // `'` and `"` do not span lines in JavaScript, so a run that reaches a
        // newline unclosed was never a string: `<p>don't</p>` is prose, and
        // consuming from it to the next apostrophe in the file would delete
        // real code between them.
        if (inner === "\n" && char !== "`") break;
        if (inner === "\\") {
          index += 2;
          continue;
        }
        if (char === "`" && code.startsWith("${", index)) {
          depth += 1;
          kept += "${";
          index += 2;
          continue;
        }
        if (char === "`" && depth > 0 && inner === "}") {
          depth -= 1;
          kept += "}";
          index += 1;
          continue;
        }
        if (depth === 0 && inner === char) {
          index += 1;
          closed = true;
          break;
        }
        if (depth > 0) kept += inner;
        index += 1;
      }
      if (!closed) {
        index = start + 1;
        out += char;
        continue;
      }
      // Template substitutions are code in both modes; the quoted text itself
      // is evidence only when strings are kept (`@comvi/core/icu` lives in
      // quotes and nowhere else).
      out += strings ? kept : code.slice(start, index);
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
 * precision `banned/icu-installer` reports its import half with.
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
 * Banned code patterns. `scope` is `"chain"` when an acquisition token in the
 * same chain clears the finding, and `"always"` when the symbol is simply gone
 * from 0.5.0 and nothing can clear it.
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
    // "always", like `banned/slim-entry` and `banned/icu-installer`, and for
    // the same reason those two are: the two chain-scoped rules exist because a
    // capability is ACQUIRED, so evidence elsewhere in the chain can make the
    // call legal. An export is not acquired. `@comvi/core/loader` either
    // publishes `flattenCatalog` or it does not, and nothing another fence in
    // the group composes can change that — a chain scope here would only give
    // the finding a way to be silenced by unrelated code.
    scope: "always",
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
    id: "banned/register-loader-on-instance",
    migration: "MIGRATION.md §0 (loader row) and §3 `.use(installer)`",
    scope: "chain",
    capability: "loader",
    find(text) {
      const matches = [];
      // `.core` is where the call MOVED (MIGRATION.md §2, §6), not proof the
      // host can serve it: `createI18n` from `@comvi/vue` wraps a BASE core
      // (packages/vue/src/createI18n.ts), so `i18n.core.registerLoader(fn)` on
      // an uncomposed wrapper throws exactly like the 0.4 call it replaced.
      // The receiver is therefore not exempt — only the chain can clear it.
      //
      // Any receiver SHAPE counts, not just an identifier chain:
      // `createI18n({…}).registerLoader(fn)` and `hosts[0].registerLoader(fn)`
      // throw exactly as `i18n.registerLoader(fn)` does, and an
      // identifier-only pattern could not see either. Only a BARE call stays
      // exempt — see the registerPlugin rule below for why.
      for (const match of text.matchAll(REGISTER_LOADER_CALL)) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "registerLoader() is not on the 0.5.0 base host. Compose the capability in the same chain — " +
      ".use(loader(map)) or .use(attachLoader), or compose the loader on the base host a " +
      "VueI18n wraps — `createI18n` from @comvi/core, then createI18nFromCore. There is no " +
      "`createCore` on @comvi/vue: the name was an alias and it is gone.",
  },
  {
    id: "banned/register-plugin-without-plugins",
    migration: "MIGRATION.md §0 (raw-plugin row) and §4",
    scope: "chain",
    capability: "plugins",
    find(text) {
      const matches = [];
      // `registerPlugin` is the 0.5 name of the raw plugin queue — the method
      // 0.4 called `use(plugin, options)`, renamed to sit beside registerLoader
      // / registerLocaleDetector (brief E §2). Like registerLoader it is a
      // CAPABILITY member, so `i18n.core.registerPlugin(…)` on an uncomposed
      // wrapper throws: the receiver is not an exemption, only the chain is.
      //
      // A RECEIVER is required, as in the registerLoader rule: inside a
      // component fence `const { registerPlugin } = useI18nPlugins()` is the
      // correct 0.5 shape, and the bare call it leads to names a capability
      // already acquired.
      //
      // "A receiver" is not "an identifier", though, and reading it that way
      // made four shapes invisible: `createI18n({…}).registerPlugin(fn)`,
      // `getI18n().registerPlugin(fn)`, `i18n?.registerPlugin(fn)` and
      // `hosts[0].registerPlugin(fn)` all throw on an uncomposed host, and none
      // of them puts a plain identifier in front of the dot.
      for (const match of text.matchAll(REGISTER_PLUGIN_CALL)) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "registerPlugin() needs the plugin capability, absent from the 0.5.0 base host. " +
      "Compose .use(plugins()) in the same chain, or register the plugin through .use(definePlugin(fn)).",
  },
  {
    id: "banned/slim-entry",
    migration: "MIGRATION.md §3 (Renames: `@comvi/<pkg>/slim` and `createSlimI18n`)",
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
    id: "banned/raw-plugin-in-use-slot",
    migration: "MIGRATION.md §4 and §7 (`E_USE_NOT_INSTALLER`)",
    scope: "always",
    find(text) {
      const matches = [];
      // The premise of this rule INVERTED at decision E. While there were two
      // verbs, an installer in the `.use()` slot was the mistake. Now `.use()`
      // is the only verb and an installer is exactly what belongs in it; the
      // mistake is the other argument — a RAW plugin, which every package
      // spells as a `*Plugin` factory (`fetchLoaderPlugin()`,
      // `localeDetectorPlugin()`, `inContextEditorPlugin()`) and an app spells
      // as its own function.
      //
      // The host's guard is an IDENTITY check: an installer widens the host in
      // place and hands the SAME object back, so `.use` throws
      // `E_USE_NOT_INSTALLER` unless the return value is the host it was
      // given. That is what catches a raw plugin whatever it returns —
      // nothing, a cleanup function, or (an async plugin) a Promise, which a
      // shape check would have waved through as an object.
      //
      // The four first-party factory NAMES are the detectable half, along
      // with an Uppercase callee (an app's own convention) and an INLINE
      // function: an installer returns the host it was given, so a literal
      // function or arrow in the slot cannot be one, and `definePlugin` is
      // what wraps it. Any OTHER bare lowercase call is indistinguishable from
      // an installer in the text, and the runtime guard is what catches it;
      // this rule does not guess. `icu` is still deliberately absent — it is not a
      // plugin in the wrong slot, it is a name that no longer exists, and
      // `banned/icu-installer` below reports it with the message that says
      // replace rather than rewrap.
      //
      // The RECEIVER is an exemption here, unlike the two capability rules
      // above, and it has to be: `app.use(Vuetify)`, `nuxtApp.vueApp.use(Antd)`
      // and `i18next.use(HttpBackend)` are somebody else's verb taking
      // somebody else's plugin (brief E, hard rule 4). Those pages are correct,
      // nothing in a comvi chain could ever clear the finding, and an
      // unclearable finding on a correct page is how a pinned baseline moves.
      const nextHosts = nextHostBindings(text);
      for (const match of text.matchAll(RAW_PLUGIN_IN_USE_SLOT)) {
        const receiver = receiverTail(text, match.index);
        if (FOREIGN_PLUGIN_RECEIVERS.has(receiver)) continue;
        if (isNextCompatUse(text, match.index, receiver, nextHosts)) continue;
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message:
      "a raw plugin is not an installer: .use() expects one, so this throws E_USE_NOT_INSTALLER. " +
      "Use the package's installer — the name without the Plugin suffix (localeDetector(), not " +
      "localeDetectorPlugin()) — or wrap " +
      "your own plugin as .use(definePlugin(fn)).",
  },
  {
    id: "banned/with-composition",
    migration: "MIGRATION.md §3 (`.use(installer)` — composing a capability)",
    scope: "always",
    find(text) {
      const matches = [];
      // No provenance check, and none is wanted: a foreign-import fence is
      // already skipped by RULE (`skipCategory`), so a `.with(` reaching this
      // rule sits in a comvi fence, where `.with` named exactly one thing —
      // the composition verb that decision E retired. Leaving it to the
      // type-checker is not an option either: most site fences never import
      // the host they compose, so nothing would ever fail on them.
      //
      // `.with(icu(` is left to `banned/icu-installer`: one call site, one
      // finding, and there the fix is to replace the call with a constructor
      // option rather than to rename the verb around it.
      //
      // The ARGUMENT is tested, though, because `with` is not a comvi-only
      // word: `date.with({ month: 2 })` is Temporal and `locales.with(0, "en")`
      // is Array.prototype.with, both flagged with nothing but `check=skip` to
      // escape with. A composition step hands `with` a CALL — the installer —
      // or a bare `attach*` reference; a plain object, a number or a string
      // argument is somebody else's `with` and is none of our business.
      for (const match of text.matchAll(
        /\.with\s*\((?!\s*icu\s*\()\s*(?:[A-Za-z_$][\w$]*\s*\(|attach(?:Loader|Plugins|Devtools)\b)/g,
      )) {
        matches.push({ index: match.index, text: match[0] });
      }
      return matches;
    },
    message: "the composition verb is `.use(...)`: `.with` is gone in 0.5.0, with no alias.",
  },
  {
    id: "banned/icu-installer",
    migration: "MIGRATION.md §0 (ICU row)",
    scope: "always",
    find(text) {
      const matches = [];
      // BOTH spellings: the name is gone either way. `.use(icu())` is what a
      // reader writes after decision E, `.with(icu())` what a 0.4 page still
      // says, and both get THIS message — not `banned/with-composition`, whose
      // fix would rename the verb around a call that has to go.
      //
      // The asymmetry with the import half below is deliberate: this half has no
      // `@comvi/*` provenance check, because a fence can call `icu()` without
      // importing anything (the site's fences routinely omit the imports), and a
      // bare `icu()` in the installer position of a comvi chain is not plausibly
      // a reader's own helper. The import half can and does demand provenance.
      for (const match of text.matchAll(/\.(?:with|use)\s*\(\s*icu\s*\(/g)) {
        matches.push({ index: match.index, text: match[0] });
      }
      // The import is the other half, and the half that survives an alias:
      // `import { icu as installIcu }` writes `installIcu()` at the call site,
      // which no call-shape regex can tell from a local helper. The IMPORTED
      // name is the fact. Specifiers are read one at a time so only the imported
      // name is inspected — `icuCompiler as icu` renames a live export and is
      // not this finding.
      // The optional `+` is a diff fence's ADDED line: `codeLines` already
      // dropped the `-` side, and an added import is code the reader copies.
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
      "the icu() installer was removed: ICU is a compiler setting, not a capability, so no " +
      "`.use(...)` composes it. Pass `compiler: icuCompiler` in the constructor options — " +
      "it works for inline, loader, CDN and API catalogs alike.",
  },
  {
    id: "banned/removed-svelte-api",
    migration:
      "MIGRATION.md §3 (`@comvi/svelte`: allowedTags removed, createLanguageStore removed)",
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
    migration: "MIGRATION.md §3 (Renames: `exposeGlobal` / `instanceId`) and §0.3",
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
      "into .use(devtools({ … })).",
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
    migration: "MIGRATION.md §0 (loader row) and §3",
    pattern: /registerLoader[^\n]{0,60}\bis (?:a|an) (?:method|member)\b/i,
    message:
      "false since 0.5.0: registerLoader is not a member of the base host — it arrives with " +
      ".use(loader()) / attachLoader.",
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
    migration: "MIGRATION.md §7 (clearTranslations clears content, never intent)",
    pattern:
      /clearTranslations[^\n]{0,100}\b(?:deactivates|stops serving|removes the namespace)\b/i,
    message:
      "since 0.5.0 clearTranslations() clears CONTENT only — deactivation moved to " +
      "removeActiveNamespace(ns) on the loader capability.",
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

  // Chain scope: every fence sharing a group key pools its acquisition tokens,
  // read from code with comments and string literals stripped.
  const chainText = new Map();
  fences.forEach((fence, index) => {
    if (!CODE_LANGS.has(fence.lang)) return;
    // A skipped fence contributes no evidence, only noise: a
    // `check=skip:historical` 0.3 example or a quoted competitor block sharing a
    // `title=` with its linted sibling would otherwise hand that sibling a
    // `.use(loader())` nobody in 0.5 wrote. Same exclusion the ICU probe makes
    // below, for the same reason.
    if (skipCategory(fence) !== null) return;
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
  // Read from the LINTED FENCES, never from `source`: a `.use(` in a prose
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
  // with one answer per host, so a prose sentence is evidence and `.use(` is
  // not the point. Two things must never count: a `check=skip` fence, because a
  // competitor block quoting `icuCompiler` would vouch for the whole page; and
  // the frontmatter, where `description: "… icuCompiler …"` is metadata about
  // the page rather than a warning inside it.
  //
  // The limit of the rule, stated so nobody mistakes it for more: this is a
  // PRESENCE probe, not a semantic one. A page that writes "we do NOT use
  // `icuCompiler` here" satisfies it. That is deliberate — the alternative is
  // parsing English — and the rule's job is to catch the page that never raises
  // the compiler question at all, which is the shape the 0.4 corpus actually has.
  const skippedLines = new Set();
  for (const fence of fences) {
    if (skipCategory(fence) === null) continue;
    for (let line = fence.line; line <= fence.endLine; line += 1) skippedLines.add(line);
  }
  const frontmatterLines = source.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0].split("\n").length ?? 0;
  const icuEvidence = source
    .split("\n")
    .filter((_, index) => index >= frontmatterLines && !skippedLines.has(index + 1))
    .join("\n");

  if (classes.has("framework") && !hasUseComposition(lintedCode)) {
    findings.push({
      file,
      line: 1,
      col: 1,
      rule: "required/use-composition",
      message:
        "a framework page or quick-start whose code never writes `.use(installer)` documents the " +
        "0.4 batteries-included host. Show how the page's capability is composed, in a fence " +
        "(Vue's own `app.use(i18n)` is a different verb and does not count).",
      migration: "MIGRATION.md §3 `.use(installer)` — composing a capability",
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
        "dev throws at ingestion, production renders the braces literally. Name " +
        "`compiler: icuCompiler` from @comvi/core/icu — the one enable form, for every catalog " +
        "source.",
      migration: "MIGRATION.md §0 (ICU row) and §0.1 (the compiler is a constructor option)",
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
      // Same definition the requirement uses: `.use(` in a table or a sentence
      // is not code a reader can run, and `app.use(i18n)` is not composition.
      hasUse: hasUseComposition(lintedCode),
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
      // The same receiver shapes the rule counts as findings — a budget that
      // cannot see `getI18n().registerLoader(fn)` is not a budget.
      count += [...line.text.matchAll(REGISTER_LOADER_CALL)].length;
    }
  }
  return count;
}

export { BANNED_RULES, PROSE_RULES, CODE_LANGS, skipCategory };
