/**
 * Turning a page's fences into virtual projects (lot D2b, docs-0.5 plan §6.2).
 *
 * The unit of compilation is the PAGE, never the corpus: eight site fences carry
 * `declare module '@comvi/core' { interface TranslationKeys … }`, and
 * `PermissiveKey = keyof TranslationKeys extends never ? string : never` means a
 * single one of them in a shared program turns `t(someString)` into an error for
 * every other fence on the site (§6.1.2). One `ts.Program` per page keeps an
 * augmentation inside the page that wrote it.
 *
 * Inside the page, the unit of RESOLUTION is finer. `title=` is a virtual file
 * name — `quick-start.mdx` writes `src/i18n.ts` eight times, once per framework
 * tab — so a page is split into projects the same way `lint.mjs` splits chains:
 *
 *   - `check=group=<id>` is explicit and pools document-wide, across tabs;
 *   - otherwise a `<TabItem>` body is one project, because two tabs are two apps;
 *   - and a repeated file name inside one project starts the next project, since
 *     a page that shows `src/i18n.ts` before and after a change is showing two
 *     apps too, and neither should be silently overwritten by the other.
 *
 * A project is a directory layout, not yet a compilation: `typecheck.mjs` gives
 * it a compiler and `sfc-check.mjs` gives it a disk.
 */

import path from "node:path";

/** Fence languages tsc can be a checker for. */
export const TS_LANGS = new Set(["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]);

/** Fence languages that need vue-tsc / svelte-check instead. */
export const SFC_LANGS = new Set(["vue", "svelte"]);

/** Fence languages that are data a snippet imports rather than code to check. */
export const DATA_LANGS = new Set(["json", "jsonc"]);

/** The extension a fence's code gets when the fence has no usable `title=`. */
const LANG_EXTENSIONS = {
  ts: ".ts",
  tsx: ".tsx",
  mts: ".mts",
  cts: ".cts",
  js: ".js",
  jsx: ".jsx",
  mjs: ".mjs",
  cjs: ".cjs",
  vue: ".vue",
  svelte: ".svelte",
  json: ".json",
  jsonc: ".json",
};

/** Extensions a `title=` may name. Anything else is a caption, not a file. */
const TITLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".json",
]);

/**
 * Untitled fences live under `src/`, not at the project root.
 *
 * 44 site fences import `./i18n` and 36 import `./locales/<x>.json`; those
 * specifiers are written from a file that sits beside `src/i18n.ts`, which is
 * where the fixture host is. Rooting untitled snippets anywhere else would make
 * every one of those imports miss by exactly one directory.
 */
const SNIPPET_DIR = "src";

/**
 * `title="./src/i18n.ts"` and `title="src/i18n.ts"` are the same file, and
 * `title="Terminal"` is not a file at all.
 *
 * @returns a project-relative POSIX path, or `null` when the title is a caption.
 */
export function titleToPath(title) {
  if (!title) return null;
  const cleaned = title.trim().replace(/^\.?\//, "");
  if (!cleaned || cleaned.startsWith("..")) return null;
  // A title is a caption unless it names a file: `title="Terminal"`,
  // `title="Before"` and `title="app/ (App Router)"` are all in the corpus.
  const extension = path.posix.extname(cleaned).toLowerCase();
  if (!TITLE_EXTENSIONS.has(extension)) return null;
  const normalized = path.posix.normalize(cleaned);
  if (normalized.startsWith("..") || path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

/** `.d.ts` counts as one extension, so `foo.d.ts` is not `foo.d` + `.ts`. */
export function isDeclarationFile(rel) {
  return rel.endsWith(".d.ts") || rel.endsWith(".d.mts") || rel.endsWith(".d.cts");
}

/**
 * Does this file need `export {}` appended to stop it being a global script?
 *
 * A TypeScript file with no top-level import or export is a SCRIPT: its
 * top-level `const i18n = …` is a global. Two such fences in one project — the
 * common shape of a page that shows the same setup twice — then collide with
 * TS2451, a finding about the page's layout rather than about its code.
 * Declaration files are left alone: turning `src/types/i18n.d.ts` into a module
 * changes `declare module '@comvi/core'` from an ambient re-declaration into an
 * augmentation, which is a different program, and the page said which one it
 * meant by writing (or not writing) the `import '@comvi/core'` above it.
 */
export function needsModuleMarker(rel, code) {
  if (isDeclarationFile(rel)) return false;
  if (!/\.[cm]?[jt]sx?$/.test(rel)) return false;
  return !/^\s*(?:import|export)\b/m.test(code);
}

/**
 * Which project a fence belongs to, before collision splitting.
 *
 * Mirrors `lint.mjs`'s chain key deliberately: if the two disagree, a fence can
 * be linted against one neighbour and compiled against another, and a report
 * that mixes the two is a report nobody can act on.
 */
export function projectKey(fence) {
  if (fence.check.group) return `group:${fence.check.group}`;
  return `tab:${fence.container ?? 0}`;
}

/** The code a fence contributes, with `diff` markers resolved to the after-state. */
function fenceLines(fence) {
  if (fence.lang !== "diff") return fence.lines;
  return fence.lines.filter((line) => !line.text.startsWith("-"));
}

/**
 * Split one page's fences into virtual projects.
 *
 * @param {Array<object>} fences from `extractFences`
 * @param {(fence: object) => string | null} skipCategory a fence's skip reason, or null
 * @returns {{ projects: Array<object>, skips: Record<string, number> }}
 */
export function buildProjects(fences, skipCategory = () => null) {
  const projects = [];
  const current = new Map();
  const skips = {};
  let serial = 0;

  const start = (key) => {
    const project = {
      id: `p${serial++}`,
      key,
      files: new Map(),
      hasTs: false,
      hasVue: false,
      hasSvelte: false,
    };
    projects.push(project);
    current.set(key, project);
    return project;
  };

  for (const fence of fences) {
    // Skips are counted BEFORE the language filter, so the categories here match
    // the ones `lint.mjs` reports for the same document. `vanilla.mdx:23` is an
    // `html` fence whose `<script type="module">` imports over https: lint counts
    // it as a url-import skip, and a driver that filtered by language first
    // would print a skip budget one short of lint's for the same page, in the
    // same report.
    const category = skipCategory(fence);
    if (category !== null) {
      skips[category] = (skips[category] ?? 0) + 1;
      continue;
    }

    const isCode = TS_LANGS.has(fence.lang) || SFC_LANGS.has(fence.lang);
    const isData = DATA_LANGS.has(fence.lang);
    if (!isCode && !isData) continue;

    const titled = titleToPath(fence.title);
    // A catalog with no name is not a file anybody imports; it is an
    // illustration of a JSON shape. Only titled data files join the project.
    if (isData && !titled) continue;

    const rel = titled ?? `${SNIPPET_DIR}/__snippet_${fence.line}${LANG_EXTENSIONS[fence.lang]}`;
    const lines = fenceLines(fence);
    let content = lines.map((line) => line.text).join("\n");
    let appended = 0;
    if (needsModuleMarker(rel, content)) {
      content += "\nexport {};\n";
      appended = 2;
    }

    const key = projectKey(fence);
    let project = current.get(key);
    const existing = project?.files.get(rel);
    if (!project || (existing && existing.content !== content)) project = start(key);

    project.files.set(rel, {
      rel,
      content,
      appended,
      prelude: 0,
      lines,
      fence,
      lang: fence.lang,
      checkable: isCode,
    });
    if (TS_LANGS.has(fence.lang)) project.hasTs = true;
    if (fence.lang === "vue") project.hasVue = true;
    if (fence.lang === "svelte") project.hasSvelte = true;
  }

  const kept = projects.filter((p) => p.files.size > 0);
  for (const project of kept) applyJsxRuntime(project);
  return { projects: kept, skips };
}

/** Specifiers that mean the project's JSX is Solid's, not React's. */
const SOLID_IMPORT = /from\s+["'](?:solid-js|@solidjs\/[^"']+|@comvi\/solid)["']/;

/**
 * Give a Solid project Solid's JSX factory.
 *
 * `jsx: react-jsx` is one setting for the whole run, and under it every Solid
 * fence fails: `'I18nProvider' cannot be used as a JSX component`,
 * `Type 'Element' is not assignable to type 'ReactNode'` — 34 findings on
 * `packages/solid/README.md` alone, none of them about the docs. TypeScript
 * takes a per-file override through the `@jsxImportSource` pragma, so the
 * project that imports Solid gets the pragma prepended to its JSX files.
 *
 * The prepended line is COUNTED (`prelude`), and `mapPosition` subtracts it, so
 * a diagnostic on the first line of the fence still reports the first line of
 * the fence. A prelude nobody subtracts is how a gate reports every finding one
 * line above where a reader will look for it.
 */
function applyJsxRuntime(project) {
  const solid = [...project.files.values()].some((file) => SOLID_IMPORT.test(file.content));
  if (!solid) return;
  for (const file of project.files.values()) {
    if (!/\.[jt]sx$/.test(file.rel)) continue;
    file.content = `/** @jsxImportSource solid-js */\n${file.content}`;
    file.prelude += 1;
  }
}

/**
 * Map a position inside a virtual file back to the source `.md`/`.mdx`.
 *
 * `line` and `character` are the compiler's 0-based coordinates in the emitted
 * text. Every emitted line remembers the source line it came from and how many
 * indent columns were stripped off it (`extract.mjs`), so a finding inside a
 * fence nested five columns deep in `<Steps><Tabs>` still points at the column a
 * reader's editor shows. Positions past the end are the appended `export {}`:
 * they belong to the fence as a whole, so they land on its opening line.
 */
export function mapPosition(file, line, character) {
  const entry = file.lines[line - (file.prelude ?? 0)];
  if (!entry) {
    return { line: file.fence.line, col: file.fence.col };
  }
  return { line: entry.srcLine, col: entry.srcCol + character };
}
