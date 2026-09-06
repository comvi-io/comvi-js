/**
 * Fenced-code extractor for the docs snippet gate (lot D2a).
 *
 * Two documentation surfaces describe the same API — `packages/*∕README.md` here
 * and the Starlight pages in the platform repo — and they have already drifted a
 * whole major apart. Every rule that keeps them together needs the same thing
 * first: the fences of a `.md`/`.mdx` file, with each emitted line still knowing
 * which source line it came from, so a finding reads `file:line:col` and a human
 * can jump to it.
 *
 * The parsing rules that matter, and why each one is here rather than "obvious":
 *
 *   - A closing fence must use the SAME character and be AT LEAST as long as the
 *     opening one (CommonMark 4.5). `pluralization.mdx` closes six 3-backtick
 *     fences with 4 backticks; a naive `line === "```"` check treats the first
 *     such line as an OPENING fence and every fence after it inverts.
 *   - Fences nest inside `<Tabs>` / `<Steps>` JSX and are indented 2–5 columns.
 *     CommonMark's 3-space limit does not apply the way it would in plain
 *     markdown, and the indentation is not part of the code: it is stripped, and
 *     how much was stripped is recorded per line so columns stay truthful.
 *   - The info string carries Expressive Code meta (`title="src/i18n.ts"`,
 *     `{1-3}`, `ins=…`). Expressive Code ignores meta keys it does not know
 *     (verified in `plugin-frames@0.44.0`), which is what lets `check=…` ride
 *     along in the same place without touching the rendered page.
 *
 * Nothing here decides whether a snippet is GOOD — that is `lint.mjs`. This file
 * only decides what a snippet IS.
 */

/** Languages that mean the same thing under a different spelling. */
const LANG_ALIASES = {
  typescript: "ts",
  javascript: "js",
  typescriptreact: "tsx",
  javascriptreact: "jsx",
  shell: "bash",
  sh: "bash",
  yml: "yaml",
};

/** `check=` values the meta vocabulary defines (§6.2 of the docs-0.5 plan). */
const CHECK_KEYS = new Set(["skip", "expect-error", "group", "js"]);

export function normalizeLang(lang) {
  const lower = (lang ?? "").toLowerCase();
  return LANG_ALIASES[lower] ?? lower;
}

/**
 * Split an info string into tokens, keeping quoted values whole so
 * `title="src/locales/en.json"` survives as one token.
 */
export function tokenizeMeta(meta) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (const char of meta) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function unquote(value) {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse the meta portion of an info string into `{ title, check }`.
 *
 * `errors` collects malformed `check=` tokens rather than throwing: a bad meta
 * token is a lint finding on a real line, not a crash that hides the other
 * hundred fences in the file.
 */
export function parseMeta(meta) {
  const check = {
    skip: false,
    skipReason: null,
    expectError: false,
    errorCode: null,
    group: null,
    js: false,
  };
  const errors = [];
  let title = null;

  for (const token of tokenizeMeta(meta)) {
    if (token.startsWith("title=")) {
      title = unquote(token.slice("title=".length));
      continue;
    }
    if (!token.startsWith("check=")) continue;

    const value = unquote(token.slice("check=".length));
    const [key, ...rest] = value.split(/[:=]/);
    const argument = rest.join(":");
    if (!CHECK_KEYS.has(key)) {
      errors.push(`unknown check "${value}": expected one of ${[...CHECK_KEYS].join(", ")}`);
      continue;
    }
    if (key === "skip") {
      check.skip = true;
      check.skipReason = argument || null;
    } else if (key === "expect-error") {
      check.expectError = true;
      check.errorCode = argument || null;
    } else if (key === "group") {
      if (!argument) errors.push("check=group needs an id, as in check=group=vue-app");
      check.group = argument || null;
    } else {
      check.js = true;
    }
  }

  return { title, check, errors };
}

/**
 * Strip up to `indent` leading whitespace columns from a content line.
 * Returns the text plus how many characters actually went, so the reported
 * column is the column in the SOURCE file and not in the dedented snippet.
 */
function stripIndent(line, indent) {
  let stripped = 0;
  while (stripped < indent && (line[stripped] === " " || line[stripped] === "\t")) stripped += 1;
  return { text: line.slice(stripped), indentStripped: stripped };
}

/**
 * Extract every fenced block from one document.
 *
 * @returns {{ fences: Array<object>, errors: Array<{ file: string, line: number, col: number, message: string }> }}
 */
export function extractFences(source, file = "<source>") {
  const lines = source.split("\n");
  const fences = [];
  const errors = [];

  let open = null;
  // Which `<TabItem>` body a fence sits in. Two tabs of one `<Tabs>` are two
  // DIFFERENT files of two different apps that happen to share a virtual name —
  // `quick-start.mdx` has eight fences titled `src/i18n.ts`, one per framework —
  // so anything scoped by `title=` has to be scoped by this as well, or the
  // React tab's composition vouches for the Vue tab's code.
  let container = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const lineNumber = index + 1;

    if (open) {
      const closing = raw.match(/^(\s*)(`{3,}|~{3,})\s*$/);
      if (closing && closing[2][0] === open.fenceChar && closing[2].length >= open.fenceLength) {
        open.closed = true;
        fences.push(finishFence(open, lineNumber));
        open = null;
        continue;
      }
      const { text, indentStripped } = stripIndent(raw, open.indent);
      open.lines.push({ text, srcLine: lineNumber, srcCol: indentStripped + 1, indentStripped });
      continue;
    }

    const opening = raw.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!opening) {
      if (/<\/?TabItem\b/.test(raw)) container += 1;
      continue;
    }

    const [, indentText, fence, info] = opening;
    // CommonMark 4.5: a backtick info string may not itself contain a backtick,
    // which is what keeps inline code spans from opening phantom fences.
    if (fence[0] === "`" && info.includes("`")) continue;

    const infoTrimmed = info.trim();
    // Expressive Code glues its line-range meta straight onto the language
    // (```ts{2}, ```tsx{1-3}), so the language ends at the first whitespace OR
    // the first brace — splitting on whitespace alone yields the language "ts{2}",
    // which matches no rule and silently drops the fence out of every check.
    const langEnd = infoTrimmed.search(/[\s{]/);
    const rawLang = langEnd === -1 ? infoTrimmed : infoTrimmed.slice(0, langEnd);
    const meta = langEnd === -1 ? "" : infoTrimmed.slice(langEnd).trim();
    const parsed = parseMeta(meta);

    for (const message of parsed.errors) {
      errors.push({ file, line: lineNumber, col: indentText.length + 1, message });
    }

    open = {
      file,
      line: lineNumber,
      col: indentText.length + 1,
      container,
      indent: indentText.length,
      fenceChar: fence[0],
      fenceLength: fence.length,
      lang: normalizeLang(rawLang),
      rawLang,
      meta,
      title: parsed.title,
      check: parsed.check,
      lines: [],
      closed: false,
    };
  }

  if (open) {
    errors.push({
      file,
      line: open.line,
      col: open.col,
      message: `unterminated ${open.fenceChar.repeat(open.fenceLength)} fence — no closing fence of at least ${open.fenceLength} "${open.fenceChar}" before end of file`,
    });
    fences.push(finishFence(open, lines.length));
  }

  return { fences, errors };
}

function finishFence(open, endLine) {
  return {
    file: open.file,
    line: open.line,
    col: open.col,
    endLine,
    container: open.container,
    indent: open.indent,
    fenceChar: open.fenceChar,
    fenceLength: open.fenceLength,
    lang: open.lang,
    rawLang: open.rawLang,
    meta: open.meta,
    title: open.title,
    check: open.check,
    closed: open.closed,
    code: open.lines.map((l) => l.text).join("\n"),
    lines: open.lines,
  };
}

/**
 * The regions of a document that are NOT inside a fence, as `{ text, srcLine }`
 * lines. Prose claims rot exactly like code does — `registerLoader() is a method
 * on the core instance` compiles under no checker — so the lint rules need the
 * prose as a first-class stream, not as leftovers.
 */
export function extractProse(source, file = "<source>") {
  const { fences } = extractFences(source, file);
  const inFence = new Set();
  for (const fence of fences) {
    for (let line = fence.line; line <= fence.endLine; line += 1) inFence.add(line);
  }
  const lines = source.split("\n");
  const prose = [];
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    if (inFence.has(lineNumber)) continue;
    prose.push({ text: lines[index], srcLine: lineNumber });
  }
  return prose;
}

/** Frontmatter as a flat `key -> string` map; `{}` when the file has none. */
export function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split("\n")) {
    const entry = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!entry) continue;
    data[entry[1]] = unquote(entry[2].trim());
  }
  return data;
}
